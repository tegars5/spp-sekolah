// src/services/InvoiceService.js
// Service Layer untuk Billing Engine SPP-Sekolah.
// Menerapkan: Anti-Double Billing, Prisma $transaction, Financial Integrity.
// Sesuai architect.md & skill.md.

const prisma = require('../lib/prisma');

const InvoiceService = {
  /**
   * Generate tagihan baru untuk seorang siswa.
   * 
   * ANTI-DOUBLE BILLING:
   * Mengecek composite unique constraint [studentId, feeCategoryId, month, year]
   * sebelum membuat tagihan. Jika sudah ada, lempar error.
   * 
   * @param {number} studentId - ID siswa.
   * @param {number} feeCategoryId - ID kategori biaya (SPP, Uang Gedung, dll).
   * @param {number|null} month - Bulan tagihan (1-12), null jika bukan bulanan.
   * @param {number} year - Tahun tagihan.
   * @returns {Promise<Object>} Invoice yang baru dibuat.
   */
  async generate(studentId, feeCategoryId, month, year) {
    // 1. Validasi input — amount harus integer positif (dari FeeCategory)
    if (!studentId || !feeCategoryId || !year) {
      throw new Error('studentId, feeCategoryId, dan year wajib diisi.');
    }

    if (month !== null && month !== undefined) {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Bulan harus berupa angka 1-12.');
      }
    }

    // 2. Pastikan siswa ada
    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
    });
    if (!student) {
      const error = new Error(`Siswa dengan ID ${studentId} tidak ditemukan.`);
      error.code = 'STUDENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 3. Ambil nominal dari FeeCategory (JANGAN hardcode — sesuai architect.md Red Flags)
    const feeCategory = await prisma.feeCategory.findUnique({
      where: { id: Number(feeCategoryId) },
    });
    if (!feeCategory) {
      const error = new Error(`Kategori biaya dengan ID ${feeCategoryId} tidak ditemukan.`);
      error.code = 'FEE_CATEGORY_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 4. ANTI-DOUBLE BILLING — Cek apakah tagihan sudah ada untuk periode ini
    //    Menggunakan composite unique key: [studentId, feeCategoryId, month, year]
    const existing = await prisma.invoice.findUnique({
      where: {
        studentId_feeCategoryId_month_year: {
          studentId: Number(studentId),
          feeCategoryId: Number(feeCategoryId),
          month: month !== null && month !== undefined ? Number(month) : null,
          year: Number(year),
        },
      },
    });

    if (existing) {
      const error = new Error(
        `Tagihan untuk periode ini sudah ada. (Student: ${studentId}, Fee: ${feeCategoryId}, ${month}/${year})`
      );
      error.code = 'INVOICE_ALREADY_EXISTS';
      error.statusCode = 409;
      throw error;
    }

    // 5. Hitung due date — akhir bulan tagihan (atau akhir tahun jika tanpa bulan)
    let dueDate = null;
    if (month) {
      // Akhir bulan: bulan berikutnya tanggal 0 = hari terakhir bulan ini
      dueDate = new Date(year, month, 0); // month is 1-indexed, Date month is 0-indexed
    } else {
      dueDate = new Date(year, 11, 31); // 31 Desember tahun tagihan
    }

    // 6. Buat invoice — amount diambil dari FeeCategory (integer, bukan float!)
    const invoice = await prisma.invoice.create({
      data: {
        studentId: Number(studentId),
        feeCategoryId: Number(feeCategoryId),
        month: month !== null && month !== undefined ? Number(month) : null,
        year: Number(year),
        amount: feeCategory.amount, // Nominal dari database, bukan hardcode
        dueDate,
        status: 'UNPAID',
      },
      include: {
        student: true,
        feeCategory: true,
      },
    });

    return invoice;
  },

  /**
   * Mengambil semua tagihan milik siswa tertentu.
   * @param {number} studentId - ID siswa.
   * @returns {Promise<Array>} Daftar tagihan siswa.
   */
  async getByStudent(studentId) {
    const invoices = await prisma.invoice.findMany({
      where: { studentId: Number(studentId) },
      include: {
        feeCategory: true,
        payments: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return invoices;
  },

  /**
   * Finalisasi pembayaran — update status Invoice & buat record Payment secara ATOMIK.
   * 
   * PRISMA $TRANSACTION:
   * Menggunakan interactive transaction untuk menjamin Financial Integrity.
   * Jika salah satu operasi gagal, seluruh perubahan di-rollback.
   * 
   * Sesuai architect.md: "Gunakan Prisma Transactions ($transaction) untuk setiap 
   * operasi yang melibatkan perubahan status tagihan dan pencatatan pembayaran."
   * 
   * @param {string} invoiceId - ID invoice yang dibayar.
   * @param {Object} paymentData - { orderId, amount, paymentType, vaNumber, rawResponse }
   * @returns {Promise<Object>} Hasil transaksi { invoice, payment }.
   */
  async finalizePayment(invoiceId, paymentData) {
    const { orderId, amount, paymentType, vaNumber, rawResponse } = paymentData;

    // Validasi: amount harus integer positif (architect.md — Strict Validation)
    if (!Number.isInteger(amount) || amount <= 0) {
      const error = new Error('Nominal pembayaran harus berupa angka positif.');
      error.code = 'INVALID_AMOUNT';
      error.statusCode = 400;
      throw error;
    }

    // IDEMPOTENCY CHECK — sesuai architect.md & skill.md (Webhook Security)
    const currentInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!currentInvoice) {
      const error = new Error(`Invoice dengan ID ${invoiceId} tidak ditemukan.`);
      error.code = 'INVOICE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Jika sudah PAID, jangan proses ulang (Idempotent Webhook — architect.md)
    if (currentInvoice.status === 'PAID') {
      const error = new Error('Invoice ini sudah dibayar.');
      error.code = 'INVOICE_ALREADY_PAID';
      error.statusCode = 409;
      throw error;
    }

    // PRISMA $TRANSACTION — Atomic update Invoice + create Payment
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update status invoice menjadi PAID
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID' },
      });

      // 2. Buat record Payment (simpan rawResponse untuk audit trail)
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          orderId,
          amount,
          paymentType: paymentType || null,
          vaNumber: vaNumber || null,
          status: 'SETTLEMENT',
          rawResponse: rawResponse || null, // Audit trail — architect.md
        },
      });

      return { invoice: updatedInvoice, payment };
    });

    return result;
  },
};

module.exports = InvoiceService;
