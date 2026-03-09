// src/services/DashboardService.js
// Service layer untuk ringkasan dashboard admin.

const prisma = require('../lib/prisma');

const OUTSTANDING_STATUSES = ['UNPAID', 'PARTIAL', 'EXPIRED'];
const SUCCESS_PAYMENT_STATUSES = ['SETTLEMENT', 'CAPTURE'];

const DashboardService = {
  /**
   * Ringkasan metrik utama dashboard admin.
   * @returns {Promise<Object>}
   */
  async getSummary() {
    const [
      activeStudents,
      inactiveStudents,
      totalInvoices,
      paidInvoices,
      outstandingInvoices,
      pendingPayments,
      billedAgg,
      outstandingAgg,
      collectedAgg,
      topOutstandingGroup,
    ] = await Promise.all([
      prisma.student.count({ where: { isActive: true } }),
      prisma.student.count({ where: { isActive: false } }),
      prisma.invoice.count(),
      prisma.invoice.count({ where: { status: 'PAID' } }),
      prisma.invoice.count({ where: { status: { in: OUTSTANDING_STATUSES } } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.invoice.aggregate({ _sum: { amount: true } }),
      prisma.invoice.aggregate({
        where: { status: { in: OUTSTANDING_STATUSES } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: { in: SUCCESS_PAYMENT_STATUSES } },
        _sum: { amount: true },
      }),
      prisma.invoice.groupBy({
        by: ['studentId'],
        where: { status: { in: OUTSTANDING_STATUSES } },
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    const topStudentIds = topOutstandingGroup.map((item) => item.studentId);
    const topStudents = topStudentIds.length
      ? await prisma.student.findMany({
          where: { id: { in: topStudentIds } },
          select: { id: true, name: true, nisn: true, class: true },
        })
      : [];

    const topStudentsMap = new Map(topStudents.map((student) => [student.id, student]));
    const topOutstandingStudents = topOutstandingGroup.map((item) => ({
      studentId: item.studentId,
      studentName: topStudentsMap.get(item.studentId)?.name || 'Unknown',
      nisn: topStudentsMap.get(item.studentId)?.nisn || null,
      className: topStudentsMap.get(item.studentId)?.class || null,
      outstandingInvoiceCount: item._count._all,
      outstandingAmount: item._sum.amount || 0,
    }));

    return {
      generatedAt: new Date().toISOString(),
      students: {
        active: activeStudents,
        inactive: inactiveStudents,
      },
      invoices: {
        total: totalInvoices,
        paid: paidInvoices,
        outstanding: outstandingInvoices,
      },
      amounts: {
        billed: billedAgg._sum.amount || 0,
        collected: collectedAgg._sum.amount || 0,
        outstanding: outstandingAgg._sum.amount || 0,
      },
      payments: {
        pending: pendingPayments,
      },
      topOutstandingStudents,
    };
  },
};

module.exports = DashboardService;
