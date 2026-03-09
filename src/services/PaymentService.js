// src/services/PaymentService.js
// Service Layer untuk integrasi Midtrans Payment Gateway.
// Menerapkan: Snap Token Generation, Idempotent Webhook, Prisma $transaction, Audit Trail.
// Sesuai architect.md & skill.md.

const prisma = require('../lib/prisma');
const snap = require('../lib/midtrans');
const crypto = require('crypto');
const midtransClient = require('midtrans-client');
const AuditLogService = require('./AuditLogService');

const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

function mapMidtransStatusToInternal(transactionStatus, fraudStatus) {
  let paymentStatus;
  let invoiceStatus;

  if (transactionStatus === 'capture') {
    paymentStatus = fraudStatus === 'accept' ? 'CAPTURE' : 'CHALLENGE';
    invoiceStatus = fraudStatus === 'accept' ? 'PAID' : 'UNPAID';
  } else if (transactionStatus === 'settlement') {
    paymentStatus = 'SETTLEMENT';
    invoiceStatus = 'PAID';
  } else if (transactionStatus === 'expire') {
    paymentStatus = 'EXPIRE';
    invoiceStatus = 'EXPIRED';
  } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
    paymentStatus = transactionStatus === 'cancel' ? 'CANCEL' : 'DENY';
    invoiceStatus = 'UNPAID';
  } else if (transactionStatus === 'pending') {
    paymentStatus = 'PENDING';
    invoiceStatus = 'UNPAID';
  } else {
    paymentStatus = 'FAILURE';
    invoiceStatus = 'UNPAID';
  }

  return { paymentStatus, invoiceStatus };
}

const PaymentService = {
  /**
   * Buat transaksi pembayaran via Midtrans Snap.
   * 
   * Alur:
   * 1. Validasi invoice (harus UNPAID)
   * 2. Cek apakah sudah ada payment PENDING (hindari duplikasi)
   * 3. Generate orderId unik (sesuai architect.md checklist)
   * 4. Request Snap Token ke Midtrans
   * 5. Simpan data Payment di database
   * 
   * @param {string} invoiceId - UUID invoice yang akan dibayar.
   * @param {Object} requester - Data user dari JWT.
   * @returns {Promise<Object>} { snapToken, paymentUrl, orderId }
   */
  async createTransaction(invoiceId, requester) {
    // 1. Ambil invoice beserta data siswa dan kategori biaya
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: true,
        feeCategory: true,
      },
    });

    if (!invoice) {
      const error = new Error(`Invoice dengan ID ${invoiceId} tidak ditemukan.`);
      error.code = 'INVOICE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Student hanya boleh membuat pembayaran untuk invoice miliknya sendiri.
    if (
      requester &&
      requester.role === 'STUDENT' &&
      Number(requester.studentId) !== Number(invoice.studentId)
    ) {
      const error = new Error('Akses ditolak. Anda hanya bisa membayar invoice milik sendiri.');
      error.code = 'FORBIDDEN_STUDENT_SCOPE';
      error.statusCode = 403;
      throw error;
    }

    // 2. Cek status invoice — hanya UNPAID yang boleh dibayar
    if (invoice.status === 'PAID') {
      const error = new Error('Invoice ini sudah dibayar.');
      error.code = 'INVOICE_ALREADY_PAID';
      error.statusCode = 409;
      throw error;
    }

    if (invoice.status === 'CANCELLED') {
      const error = new Error('Invoice ini sudah dibatalkan.');
      error.code = 'INVOICE_CANCELLED';
      error.statusCode = 400;
      throw error;
    }

    // 3. Cek apakah sudah ada payment PENDING untuk invoice ini
    //    Jika ada, kembalikan snapToken yang sudah ada (hindari duplikasi)
    const existingPayment = await prisma.payment.findFirst({
      where: {
        invoiceId,
        status: 'PENDING',
      },
    });

    if (existingPayment && existingPayment.snapToken) {
      return {
        snapToken: existingPayment.snapToken,
        paymentUrl: existingPayment.paymentUrl,
        orderId: existingPayment.orderId,
        message: 'Transaksi sebelumnya masih berlaku.',
      };
    }

    // 4. Generate orderId unik — sesuai architect.md: "orderId yang dikirim ke Midtrans bersifat unik"
    //    Format: SPP-{6 char random}-{timestamp}
    const uniqueId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const timestamp = Date.now();
    const orderId = `SPP-${uniqueId}-${timestamp}`;

    // 5. Siapkan parameter Midtrans Snap — sesuai skill.md pattern
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: invoice.amount, // Integer, bukan float (architect.md)
      },
      customer_details: {
        first_name: invoice.student.name,
        phone: invoice.student.phone || '',
      },
      item_details: [
        {
          id: `FEE-${invoice.feeCategoryId}`,
          price: invoice.amount,
          quantity: 1,
          name: `${invoice.feeCategory.name} - ${invoice.month ? `Bulan ${invoice.month}/` : ''}${invoice.year}`,
        },
      ],
    };

    // 6. Request Snap Token ke Midtrans
    const transaction = await snap.createTransaction(parameter);

    // 7. Simpan record Payment di database dengan status PENDING
    await prisma.payment.create({
      data: {
        invoiceId,
        orderId,
        amount: invoice.amount,
        status: 'PENDING',
        snapToken: transaction.token,
        paymentUrl: transaction.redirect_url,
      },
    });

    return {
      snapToken: transaction.token,
      paymentUrl: transaction.redirect_url,
      orderId,
    };
  },

  /**
   * Mengambil detail pembayaran berdasarkan orderId.
   * Student hanya boleh melihat pembayaran invoice miliknya sendiri.
   *
   * @param {string} orderId - Order ID payment.
   * @param {Object} requester - Data user dari JWT.
   * @returns {Promise<Object>} Detail payment.
   */
  async getByOrderId(orderId, requester) {
    const payment = await prisma.payment.findUnique({
      where: { orderId },
      include: {
        invoice: {
          include: {
            student: true,
            feeCategory: true,
          },
        },
      },
    });

    if (!payment) {
      const error = new Error(`Payment dengan orderId ${orderId} tidak ditemukan.`);
      error.code = 'PAYMENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    if (
      requester &&
      requester.role === 'STUDENT' &&
      Number(requester.studentId) !== Number(payment.invoice.studentId)
    ) {
      const error = new Error('Akses ditolak. Anda hanya bisa melihat pembayaran milik sendiri.');
      error.code = 'FORBIDDEN_STUDENT_SCOPE';
      error.statusCode = 403;
      throw error;
    }

    return payment;
  },

  /**
   * List pembayaran dengan filter opsional invoiceId.
   * Student otomatis dibatasi ke invoice miliknya sendiri.
   *
   * @param {Object} requester - Data user dari JWT.
   * @param {string|undefined} invoiceId - UUID invoice (opsional).
   * @returns {Promise<Array>} Daftar payment.
   */
  async listPayments(requester, invoiceId) {
    const where = {};

    if (invoiceId) {
      where.invoiceId = invoiceId;
    }

    if (requester && requester.role === 'STUDENT') {
      where.invoice = { studentId: Number(requester.studentId) };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        invoice: {
          include: {
            student: true,
            feeCategory: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments;
  },

  /**
   * Reconciliation status payment dari Midtrans.
   * Admin bisa cek mismatch status Midtrans vs DB, lalu sinkronkan bila diperlukan.
   *
   * @param {string} orderId
   * @param {Object} requester
   * @param {boolean} applyChanges
   * @returns {Promise<Object>}
   */
  async reconcilePayment(orderId, requester, applyChanges = false) {
    if (!requester || !['ADMIN', 'TREASURER'].includes(requester.role)) {
      const error = new Error('Akses ditolak. Hanya ADMIN/TREASURER yang dapat menjalankan rekonsiliasi.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    const payment = await prisma.payment.findUnique({
      where: { orderId },
      include: { invoice: true },
    });

    if (!payment) {
      const error = new Error(`Payment dengan orderId ${orderId} tidak ditemukan.`);
      error.code = 'PAYMENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const midtransStatus = await coreApi.transaction.status(orderId);
    const { paymentStatus, invoiceStatus } = mapMidtransStatusToInternal(
      midtransStatus.transaction_status,
      midtransStatus.fraud_status
    );

    const mismatch = {
      paymentStatus: payment.status !== paymentStatus,
      invoiceStatus: payment.invoice.status !== invoiceStatus,
    };

    let applied = false;
    if (applyChanges && (mismatch.paymentStatus || mismatch.invoiceStatus)) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { orderId },
          data: {
            status: paymentStatus,
            paymentType: midtransStatus.payment_type || payment.paymentType || null,
            vaNumber: midtransStatus.va_numbers?.[0]?.va_number || payment.vaNumber || null,
            transactionId: midtransStatus.transaction_id || payment.transactionId || null,
            rawResponse: midtransStatus,
          },
        });

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: invoiceStatus },
        });
      });
      applied = true;
    }

    await AuditLogService.logAction({
      actorUserId: requester.userId,
      actorRole: requester.role,
      action: 'PAYMENT_RECONCILE',
      entity: 'PAYMENT',
      entityId: orderId,
      metadata: {
        applyRequested: applyChanges,
        applied,
        mismatch,
      },
    });

    return {
      orderId,
      applyRequested: applyChanges,
      applied,
      mismatch,
      local: {
        paymentStatus: payment.status,
        invoiceStatus: payment.invoice.status,
      },
      midtrans: {
        transactionStatus: midtransStatus.transaction_status,
        fraudStatus: midtransStatus.fraud_status || null,
        paymentStatus,
        invoiceStatus,
        transactionId: midtransStatus.transaction_id || null,
      },
    };
  },

  /**
   * Rekonsiliasi batch untuk payment berstatus PENDING.
   * Cocok untuk maintenance harian ketika webhook terlewat.
   *
   * @param {Object} requester
   * @param {Object} options
   * @param {number} options.limit
   * @param {boolean} options.applyChanges
   * @returns {Promise<Object>}
   */
  async reconcilePendingPayments(requester, { limit = 20, applyChanges = false } = {}) {
    if (!requester || !['ADMIN', 'TREASURER'].includes(requester.role)) {
      const error = new Error('Akses ditolak. Hanya ADMIN/TREASURER yang dapat menjalankan rekonsiliasi.');
      error.code = 'FORBIDDEN';
      error.statusCode = 403;
      throw error;
    }

    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const pendings = await prisma.payment.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: parsedLimit,
      select: { orderId: true },
    });

    const results = [];
    for (const item of pendings) {
      try {
        const result = await this.reconcilePayment(item.orderId, requester, applyChanges);
        results.push({
          orderId: item.orderId,
          ok: true,
          mismatch: result.mismatch,
          applied: result.applied,
        });
      } catch (error) {
        results.push({
          orderId: item.orderId,
          ok: false,
          error_code: error.code || 'RECONCILE_FAILED',
          message: error.message,
        });
      }
    }

    const successCount = results.filter((item) => item.ok).length;
    const failedCount = results.length - successCount;
    const appliedCount = results.filter((item) => item.ok && item.applied).length;

    await AuditLogService.logAction({
      actorUserId: requester.userId,
      actorRole: requester.role,
      action: 'PAYMENT_RECONCILE_PENDING_BATCH',
      entity: 'PAYMENT',
      metadata: {
        scanned: results.length,
        successCount,
        failedCount,
        appliedCount,
        applyChanges,
      },
    });

    return {
      scanned: results.length,
      successCount,
      failedCount,
      appliedCount,
      results,
    };
  },

  /**
   * Handle webhook notification dari Midtrans.
   * 
   * IDEMPOTENT WEBHOOK — sesuai architect.md:
   * "Desain handler webhook Midtrans agar bisa diproses berkali-kali 
   *  tanpa mengubah status PAID menjadi PAID lagi atau menduplikasi riwayat pembayaran."
   * 
   * Alur:
   * 1. Verifikasi signature key dari Midtrans
   * 2. Cari Payment by orderId
   * 3. Idempotency check — skip jika sudah diproses
   * 4. Map status Midtrans → status internal
   * 5. Update Payment + Invoice secara atomik via $transaction
   * 6. Simpan rawResponse untuk audit trail
   * 
   * @param {Object} notification - Raw JSON payload dari Midtrans.
   * @returns {Promise<Object>} { status, message }
   */
  async handleWebhookNotification(notification) {
    const {
      order_id: orderId,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      signature_key: signatureKey,
      status_code: statusCode,
      gross_amount: grossAmount,
    } = notification;

    // 1. SIGNATURE VERIFICATION — memastikan request benar dari Midtrans
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    if (signatureKey !== expectedSignature) {
      const error = new Error('Signature webhook tidak valid.');
      error.code = 'INVALID_SIGNATURE';
      error.statusCode = 403;
      throw error;
    }

    // 2. Cari payment berdasarkan orderId
    const payment = await prisma.payment.findUnique({
      where: { orderId },
      include: { invoice: true },
    });

    if (!payment) {
      const error = new Error(`Payment dengan orderId ${orderId} tidak ditemukan.`);
      error.code = 'PAYMENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 3. IDEMPOTENCY CHECK — sesuai skill.md:
    //    "if (currentInvoice.status === 'PAID') return 'Already processed'"
    if (payment.invoice.status === 'PAID') {
      return { status: 'ok', message: 'Transaksi sudah diproses sebelumnya.' };
    }

    // 4. MAP STATUS MIDTRANS → STATUS INTERNAL
    //    Sesuai architect.md checklist: "status transaksi dipetakan dengan benar"
    const { paymentStatus, invoiceStatus } = mapMidtransStatusToInternal(transactionStatus, fraudStatus);

    // 5. PRISMA $TRANSACTION — Atomic update Payment + Invoice
    //    Sesuai architect.md: "Gunakan Prisma Transactions ($transaction)"
    await prisma.$transaction(async (tx) => {
      // Update Payment status + simpan rawResponse untuk audit trail
      await tx.payment.update({
        where: { orderId },
        data: {
          status: paymentStatus,
          paymentType: notification.payment_type || null,
          vaNumber: notification.va_numbers?.[0]?.va_number || null,
          transactionId: notification.transaction_id || null,
          rawResponse: notification, // Audit trail — architect.md
        },
      });

      // Update Invoice status
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: invoiceStatus },
      });
    });

    return {
      status: 'ok',
      message: `Webhook diproses: ${transactionStatus} → Invoice ${invoiceStatus}`,
      orderId,
    };
  },
};

module.exports = PaymentService;
