// src/services/InvoiceService.js
// Service Layer untuk Billing Engine SPP-Sekolah.
// Menerapkan: Anti-Double Billing, Prisma $transaction, Financial Integrity.
// Sesuai architect.md & skill.md.

const prisma = require('../lib/prisma');

/**
 * Hitung due date — tanggal 10 bulan berikutnya.
 * Contoh: invoice bulan Januari 2026 → dueDate = 10 Februari 2026.
 * Jika tanpa bulan (non-bulanan), dueDate = 31 Desember tahun tagihan.
 * 
 * @param {number|null} month - Bulan tagihan (1-12).
 * @param {number} year - Tahun tagihan.
 * @returns {Date} Tanggal jatuh tempo.
 */
function calculateDueDate(month, year) {
  if (month) {
    // Tanggal 10 bulan berikutnya
    // Jika bulan = 12 (Desember) → 10 Januari tahun berikutnya
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return new Date(nextYear, nextMonth - 1, 10); // Date month is 0-indexed
  }
  // Tagihan non-bulanan: akhir tahun
  return new Date(year, 11, 31);
}

const InvoiceService = {
  /**
   * Generate tagihan baru untuk seorang siswa.
   * 
   * ANTI-DOUBLE BILLING:
   * Mengecek composite unique constraint [studentId, feeCategoryId, month, year]
   * sebelum membuat tagihan. Jika sudah ada, lempar error.
   * 
   * Input sudah divalidasi oleh Zod middleware di layer sebelumnya.
   * 
   * @param {number} studentId - ID siswa.
   * @param {number} feeCategoryId - ID kategori biaya (SPP, Uang Gedung, dll).
   * @param {number|null} month - Bulan tagihan (1-12), null jika bukan bulanan.
   * @param {number} year - Tahun tagihan.
   * @returns {Promise<Object>} Invoice yang baru dibuat.
   */
  async generate(studentId, feeCategoryId, month, year) {
    // 1. Pastikan siswa ada
    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
    });
    if (!student) {
      const error = new Error(`Siswa dengan ID ${studentId} tidak ditemukan.`);
      error.code = 'STUDENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 2. Ambil nominal dari FeeCategory (JANGAN hardcode — sesuai architect.md Red Flags)
    const feeCategory = await prisma.feeCategory.findUnique({
      where: { id: Number(feeCategoryId) },
    });
    if (!feeCategory) {
      const error = new Error(`Kategori biaya dengan ID ${feeCategoryId} tidak ditemukan.`);
      error.code = 'FEE_CATEGORY_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 3. ANTI-DOUBLE BILLING — Cek apakah tagihan sudah ada untuk periode ini
    //    Menggunakan composite unique key: [studentId, feeCategoryId, month, year]
    const parsedMonth = month !== null && month !== undefined ? Number(month) : null;

    const existing = await prisma.invoice.findUnique({
      where: {
        studentId_feeCategoryId_month_year: {
          studentId: Number(studentId),
          feeCategoryId: Number(feeCategoryId),
          month: parsedMonth,
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

    // 4. Hitung due date — tanggal 10 bulan berikutnya
    const dueDate = calculateDueDate(parsedMonth, Number(year));

    // 5. Buat invoice — amount diambil dari FeeCategory (integer, bukan float!)
    const invoice = await prisma.invoice.create({
      data: {
        studentId: Number(studentId),
        feeCategoryId: Number(feeCategoryId),
        month: parsedMonth,
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
   * BULK GENERATE — Generate tagihan untuk SEMUA siswa aktif sekaligus.
   * 
   * Untuk admin sekolah: satu klik buat tagihan ratusan siswa.
   * Anti-Double Billing tetap aktif: siswa yang sudah punya tagihan
   * di periode tersebut akan di-skip (tidak error).
   * 
   * @param {number} feeCategoryId - ID kategori biaya.
   * @param {number|null} month - Bulan tagihan (1-12), null jika bukan bulanan.
   * @param {number} year - Tahun tagihan.
   * @returns {Promise<Object>} { created: [...], skipped: [...], totalCreated, totalSkipped }
   */
  async generateBulk(feeCategoryId, month, year) {
    // 1. Ambil nominal dari FeeCategory
    const feeCategory = await prisma.feeCategory.findUnique({
      where: { id: Number(feeCategoryId) },
    });
    if (!feeCategory) {
      const error = new Error(`Kategori biaya dengan ID ${feeCategoryId} tidak ditemukan.`);
      error.code = 'FEE_CATEGORY_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // 2. Ambil semua siswa aktif
    const activeStudents = await prisma.student.findMany({
      where: { isActive: true },
    });

    if (activeStudents.length === 0) {
      const error = new Error('Tidak ada siswa aktif yang ditemukan.');
      error.code = 'NO_ACTIVE_STUDENTS';
      error.statusCode = 404;
      throw error;
    }

    const parsedMonth = month !== null && month !== undefined ? Number(month) : null;
    const dueDate = calculateDueDate(parsedMonth, Number(year));

    const created = [];
    const skipped = [];

    // 3. Loop tiap siswa — cek Anti-Double Billing per siswa, skip jika sudah ada
    for (const student of activeStudents) {
      const existing = await prisma.invoice.findUnique({
        where: {
          studentId_feeCategoryId_month_year: {
            studentId: student.id,
            feeCategoryId: Number(feeCategoryId),
            month: parsedMonth,
            year: Number(year),
          },
        },
      });

      if (existing) {
        skipped.push({
          studentId: student.id,
          studentName: student.name,
          reason: 'Tagihan sudah ada untuk periode ini.',
        });
        continue;
      }

      // Buat invoice baru
      const invoice = await prisma.invoice.create({
        data: {
          studentId: student.id,
          feeCategoryId: Number(feeCategoryId),
          month: parsedMonth,
          year: Number(year),
          amount: feeCategory.amount,
          dueDate,
          status: 'UNPAID',
        },
      });

      created.push({
        invoiceId: invoice.id,
        studentId: student.id,
        studentName: student.name,
        amount: invoice.amount,
      });
    }

    return {
      feeCategoryName: feeCategory.name,
      period: `${parsedMonth || '-'}/${year}`,
      totalCreated: created.length,
      totalSkipped: skipped.length,
      created,
      skipped,
    };
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

  // CATATAN: Logika finalisasi pembayaran telah dipindahkan ke
  // PaymentService.handleWebhookNotification() yang lebih lengkap
  // (termasuk signature verification, status mapping, dan audit trail).
};

module.exports = InvoiceService;
