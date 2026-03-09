// src/routes/studentRoutes.js
// Route definitions untuk fitur Siswa.

const { Router } = require('express');
const StudentController = require('../controllers/StudentController');

const router = Router();

// POST /api/students — Daftarkan siswa baru
router.post('/', StudentController.create);

// GET /api/students — Ambil semua data siswa
router.get('/', StudentController.getAll);

// GET /api/students/:id — Ambil detail siswa (+ invoices & payments)
router.get('/:id', StudentController.getById);

module.exports = router;
