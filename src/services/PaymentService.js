// src/services/PaymentService.js
// Service Layer untuk integrasi Midtrans Payment Gateway.
// Menerapkan: Snap Token Generation, Idempotent Webhook, Prisma $transaction, Audit Trail.
// Sesuai architect.md & skill.md.

const prisma = require('../lib/prisma');
const snap = require('../lib/midtrans');
const crypto = require('crypto');

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
   * @returns {Promise<Object>} { snapToken, paymentUrl, orderId }
   */
  async createTransaction(invoiceId) {
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
    let paymentStatus;
    let invoiceStatus;

    if (transactionStatus === 'capture') {
      // Untuk kartu kredit: cek fraud_status
      paymentStatus = fraudStatus === 'accept' ? 'CAPTURE' : 'CHALLENGE';
      invoiceStatus = fraudStatus === 'accept' ? 'PAID' : 'UNPAID';
    } else if (transactionStatus === 'settlement') {
      // Settlement = pembayaran berhasil (PAID)
      paymentStatus = 'SETTLEMENT';
      invoiceStatus = 'PAID';
    } else if (transactionStatus === 'expire') {
      // Sesuai architect.md: "menangani kondisi EXPIRED jika siswa tidak membayar tepat waktu"
      paymentStatus = 'EXPIRE';
      invoiceStatus = 'EXPIRED';
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
      paymentStatus = transactionStatus === 'cancel' ? 'CANCEL' : 'DENY';
      invoiceStatus = 'UNPAID'; // Invoice kembali ke UNPAID agar bisa dicoba lagi
    } else if (transactionStatus === 'pending') {
      paymentStatus = 'PENDING';
      invoiceStatus = 'UNPAID';
    } else {
      paymentStatus = 'FAILURE';
      invoiceStatus = 'UNPAID';
    }

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
