// src/controllers/StudentController.js
// Controller tipis — hanya menangani request/response.
// Logika bisnis ada di StudentService (sesuai architect.md).

const StudentService = require('../services/StudentService');

const StudentController = {
  /**
   * POST /api/students — Mendaftarkan siswa baru.
   */
  async create(req, res, next) {
    try {
      const result = await StudentService.register(req.body, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/students — Mengambil semua data siswa.
   */
  async getAll(req, res, next) {
    try {
      const students = await StudentService.getAll();
      return res.status(200).json({ success: true, data: students });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/students/:id — Mengambil detail siswa beserta invoices & payments.
   */
  async getById(req, res, next) {
    try {
      const student = await StudentService.getById(req.params.id);
      return res.status(200).json({ success: true, data: student });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = StudentController;
