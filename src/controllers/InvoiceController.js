// src/controllers/InvoiceController.js
// Controller tipis — hanya menangani request/response.
// Logika bisnis ada di InvoiceService (sesuai architect.md).

const InvoiceService = require('../services/InvoiceService');

const InvoiceController = {
  /**
   * POST /api/invoices — Generate tagihan baru (single).
   * Body sudah divalidasi oleh Zod middleware.
   */
  async create(req, res, next) {
    try {
      const { studentId, feeCategoryId, month, year } = req.body;
      const result = await InvoiceService.generate(studentId, feeCategoryId, month, year, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/invoices/bulk — Bulk generate tagihan untuk semua siswa aktif.
   * Body sudah divalidasi oleh Zod middleware.
   */
  async bulkGenerate(req, res, next) {
    try {
      const { feeCategoryId, month, year } = req.body;
      const result = await InvoiceService.generateBulk(feeCategoryId, month, year, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/students/:studentId/invoices — Ambil tagihan siswa tertentu.
   */
  async getByStudent(req, res, next) {
    try {
      const invoices = await InvoiceService.getByStudent(req.params.studentId, req.user);
      return res.status(200).json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/invoices/:id — Ambil detail satu invoice.
   */
  async getById(req, res, next) {
    try {
      const invoice = await InvoiceService.getById(req.params.id, req.user);
      return res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/invoices/expire-overdue — Ubah invoice overdue jadi EXPIRED.
   */
  async expireOverdue(req, res, next) {
    try {
      const referenceDate = req.body.referenceDate
        ? new Date(req.body.referenceDate)
        : new Date();

      const result = await InvoiceService.expireOverdueInvoices(referenceDate, req.user);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = InvoiceController;
