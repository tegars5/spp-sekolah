// src/services/InvoiceService.js
// Service Layer untuk Billing Engine SPP-Sekolah.
// Menerapkan: Anti-Double Billing, Prisma $transaction, Financial Integrity.
// Sesuai architect.md & skill.md.

const prisma = require('../lib/prisma');
const AuditLogService = require('./AuditLogService');

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
  async generate(studentId, feeCategoryId, month, year, requester = null) {
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
        amount: feeCategory.amount, 
        dueDate,
        status: 'UNPAID',
      },
      include: {
        student: true,
        feeCategory: true,
      },
    });

    await AuditLogService.logAction({
      actorUserId: requester?.userId,
      actorRole: requester?.role,
      action: 'INVOICE_CREATE',
      entity: 'INVOICE',
      entityId: invoice.id,
      metadata: {
        studentId: invoice.studentId,
        feeCategoryId: invoice.feeCategoryId,
        month: invoice.month,
        year: invoice.year,
        amount: invoice.amount,
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
  async generateBulk(feeCategoryId, month, year, requester = null) {
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

    const result = {
      feeCategoryName: feeCategory.name,
      period: `${parsedMonth || '-'}/${year}`,
      totalCreated: created.length,
      totalSkipped: skipped.length,
      created,
      skipped,
    };

    await AuditLogService.logAction({
      actorUserId: requester?.userId,
      actorRole: requester?.role,
      action: 'INVOICE_BULK_GENERATE',
      entity: 'INVOICE',
      metadata: {
        feeCategoryId: Number(feeCategoryId),
        month: parsedMonth,
        year: Number(year),
        totalCreated: result.totalCreated,
        totalSkipped: result.totalSkipped,
      },
    });

    return result;
  },

  /**
   * Mengambil semua tagihan milik siswa tertentu.
   * @param {number} studentId - ID siswa.
   * @param {Object} requester - Data user dari JWT (opsional, defense-in-depth).
   * @returns {Promise<Array>} Daftar tagihan siswa.
   */
  async getByStudent(studentId, requester = null) {
    if (
      requester &&
      requester.role === 'STUDENT' &&
      Number(requester.studentId) !== Number(studentId)
    ) {
      const error = new Error('Akses ditolak. Anda hanya bisa melihat tagihan milik sendiri.');
      error.code = 'FORBIDDEN_STUDENT_SCOPE';
      error.statusCode = 403;
      throw error;
    }

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
   * Mengambil detail satu invoice berdasarkan ID.
   * Student hanya boleh mengakses invoice miliknya sendiri.
   *
   * @param {string} invoiceId - UUID invoice.
   * @param {Object} requester - Data user dari JWT.
   * @returns {Promise<Object>} Detail invoice.
   */
  async getById(invoiceId, requester = null) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: true,
        feeCategory: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      const error = new Error(`Invoice dengan ID ${invoiceId} tidak ditemukan.`);
      error.code = 'INVOICE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    if (
      requester &&
      requester.role === 'STUDENT' &&
      Number(requester.studentId) !== Number(invoice.studentId)
    ) {
      const error = new Error('Akses ditolak. Anda hanya bisa melihat invoice milik sendiri.');
      error.code = 'FORBIDDEN_STUDENT_SCOPE';
      error.statusCode = 403;
      throw error;
    }

    return invoice;
  },

  /**
   * Menandai invoice yang lewat jatuh tempo menjadi EXPIRED.
   * Hanya memproses invoice status UNPAID dan PARTIAL.
   *
   * @param {Date} referenceDate - Patokan waktu pengecekan overdue.
   * @returns {Promise<Object>} Ringkasan proses expire.
   */
  async expireOverdueInvoices(referenceDate = new Date(), requester = null) {
    const overdueWhere = {
      dueDate: { lt: referenceDate },
      status: { in: ['UNPAID', 'PARTIAL'] },
    };

    const overdueInvoiceIds = await prisma.invoice.findMany({
      where: overdueWhere,
      select: { id: true },
    });

    if (overdueInvoiceIds.length === 0) {
      return {
        referenceDate: referenceDate.toISOString(),
        totalExpired: 0,
        message: 'Tidak ada invoice overdue yang perlu di-expire.',
      };
    }

    await prisma.invoice.updateMany({
      where: overdueWhere,
      data: { status: 'EXPIRED' },
    });

    const result = {
      referenceDate: referenceDate.toISOString(),
      totalExpired: overdueInvoiceIds.length,
      expiredInvoiceIds: overdueInvoiceIds.map((item) => item.id),
    };

    await AuditLogService.logAction({
      actorUserId: requester?.userId,
      actorRole: requester?.role,
      action: 'INVOICE_EXPIRE_OVERDUE',
      entity: 'INVOICE',
      metadata: {
        referenceDate: result.referenceDate,
        totalExpired: result.totalExpired,
      },
    });

    return result;
  },

  // CATATAN: Logika finalisasi pembayaran telah dipindahkan ke
  // PaymentService.handleWebhookNotification() yang lebih lengkap
  // (termasuk signature verification, status mapping, dan audit trail).
};

module.exports = InvoiceService;
