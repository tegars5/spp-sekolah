// src/services/ReportService.js
// Service layer untuk laporan keuangan dan tunggakan.

const prisma = require('../lib/prisma');

const OUTSTANDING_STATUSES = ['UNPAID', 'PARTIAL', 'EXPIRED'];
const SUCCESS_PAYMENT_STATUSES = ['SETTLEMENT', 'CAPTURE'];

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function rowsToCsv(headers, rows) {
  const headerLine = headers.map(escapeCsvValue).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvValue).join(','));
  return [headerLine, ...dataLines].join('\n');
}

function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getYearRange(year) {
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2100) {
    const error = new Error('Parameter year tidak valid.');
    error.code = 'INVALID_YEAR';
    error.statusCode = 400;
    throw error;
  }

  const start = new Date(parsedYear, 0, 1, 0, 0, 0);
  const end = new Date(parsedYear + 1, 0, 1, 0, 0, 0);
  return { parsedYear, start, end };
}

const ReportService = {
  /**
   * Laporan ringkas per bulan untuk satu tahun:
   * billed, collected, outstanding.
   */
  async getFinanceReport(year) {
    const { parsedYear, start, end } = getYearRange(year);

    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { createdAt: true, amount: true, status: true },
      }),
      prisma.payment.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          status: { in: SUCCESS_PAYMENT_STATUSES },
        },
        select: { createdAt: true, amount: true },
      }),
    ]);

    const monthMap = new Map();
    for (let month = 1; month <= 12; month += 1) {
      const key = `${parsedYear}-${String(month).padStart(2, '0')}`;
      monthMap.set(key, { month: key, billed: 0, collected: 0, outstanding: 0 });
    }

    for (const invoice of invoices) {
      const key = toMonthKey(invoice.createdAt);
      const bucket = monthMap.get(key);
      if (!bucket) continue;
      bucket.billed += invoice.amount;
      if (OUTSTANDING_STATUSES.includes(invoice.status)) {
        bucket.outstanding += invoice.amount;
      }
    }

    for (const payment of payments) {
      const key = toMonthKey(payment.createdAt);
      const bucket = monthMap.get(key);
      if (!bucket) continue;
      bucket.collected += payment.amount;
    }

    const monthly = Array.from(monthMap.values());
    const totals = monthly.reduce(
      (acc, item) => {
        acc.billed += item.billed;
        acc.collected += item.collected;
        acc.outstanding += item.outstanding;
        return acc;
      },
      { billed: 0, collected: 0, outstanding: 0 }
    );

    return {
      year: parsedYear,
      totals,
      monthly,
    };
  },

  /**
   * Laporan siswa menunggak.
   */
  async getOutstandingReport(limit = 20) {
    const parsedLimit = Number(limit) || 20;

    const grouped = await prisma.invoice.groupBy({
      by: ['studentId'],
      where: { status: { in: OUTSTANDING_STATUSES } },
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: parsedLimit,
    });

    const studentIds = grouped.map((item) => item.studentId);
    const students = studentIds.length
      ? await prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, nisn: true, name: true, class: true },
        })
      : [];

    const studentMap = new Map(students.map((student) => [student.id, student]));

    const rows = grouped.map((item) => ({
      studentId: item.studentId,
      nisn: studentMap.get(item.studentId)?.nisn || null,
      studentName: studentMap.get(item.studentId)?.name || 'Unknown',
      className: studentMap.get(item.studentId)?.class || null,
      outstandingInvoiceCount: item._count._all,
      outstandingAmount: item._sum.amount || 0,
    }));

    return {
      totalRows: rows.length,
      rows,
    };
  },

  /**
   * Export laporan keuangan tahunan ke CSV.
   */
  async exportFinanceCsv(year) {
    const report = await this.getFinanceReport(year);
    const rows = report.monthly.map((item) => [
      item.month,
      item.billed,
      item.collected,
      item.outstanding,
    ]);

    rows.push([]);
    rows.push(['TOTAL', report.totals.billed, report.totals.collected, report.totals.outstanding]);

    return rowsToCsv(
      ['month', 'billed', 'collected', 'outstanding'],
      rows
    );
  },

  /**
   * Export laporan tunggakan ke CSV.
   */
  async exportOutstandingCsv(limit = 20) {
    const report = await this.getOutstandingReport(limit);
    const rows = report.rows.map((item) => [
      item.studentId,
      item.nisn,
      item.studentName,
      item.className,
      item.outstandingInvoiceCount,
      item.outstandingAmount,
    ]);

    return rowsToCsv(
      [
        'studentId',
        'nisn',
        'studentName',
        'className',
        'outstandingInvoiceCount',
        'outstandingAmount',
      ],
      rows
    );
  },
};

module.exports = ReportService;
