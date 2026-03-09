// src/controllers/InvoiceController.js
// Controller tipis — hanya menangani request/response.
// Logika bisnis ada di InvoiceService (sesuai architect.md).

const InvoiceService = require('../services/InvoiceService');

const InvoiceController = {
  /**
   * POST /api/invoices — Generate tagihan baru.
   * Body: { studentId, feeCategoryId, month, year }
   */
  async create(req, res, next) {
    try {
      const { studentId, feeCategoryId, month, year } = req.body;
      const result = await InvoiceService.generate(studentId, feeCategoryId, month, year);
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
      const invoices = await InvoiceService.getByStudent(req.params.studentId);
      return res.status(200).json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = InvoiceController;
