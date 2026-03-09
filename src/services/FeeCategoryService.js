// src/services/FeeCategoryService.js
// Service Layer untuk pengelolaan kategori biaya (SPP, Uang Gedung, dll).

const prisma = require('../lib/prisma');
const AuditLogService = require('./AuditLogService');

const FeeCategoryService = {
  /**
   * Tambah kategori biaya baru.
   * @param {Object} data - { name, amount, description }
   * @returns {Promise<Object>} Kategori biaya yang baru dibuat.
   */
  async create(data, requester = null) {
    const { name, amount, description } = data;

    const category = await prisma.feeCategory.create({
      data: { name, amount, description: description || null },
    });

    await AuditLogService.logAction({
      actorUserId: requester?.userId,
      actorRole: requester?.role,
      action: 'FEE_CATEGORY_CREATE',
      entity: 'FEE_CATEGORY',
      entityId: category.id,
      metadata: { name: category.name, amount: category.amount },
    });

    return category;
  },

  /**
   * Ambil semua kategori biaya.
   * @returns {Promise<Array>} Daftar kategori biaya.
   */
  async getAll() {
    const categories = await prisma.feeCategory.findMany({
      orderBy: { name: 'asc' },
    });
    return categories;
  },
};

module.exports = FeeCategoryService;
