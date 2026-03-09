// src/routes/studentRoutes.js
// Route definitions untuk fitur Siswa.
// Menerapkan Zod validation middleware dan RBAC (Role-Based Access Control).

const { Router } = require('express');
const StudentController = require('../controllers/StudentController');
const { validate, createStudentSchema } = require('../middlewares/validators');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// Semua rute di bawah ini wajib login
router.use(authenticate);

// POST /api/students — Daftarkan siswa baru (Hanya Admin)
router.post(
  '/', 
  authorizeRoles('ADMIN'), 
  validate(createStudentSchema), 
  StudentController.create
);

// GET /api/students — Ambil semua data siswa (Hanya Admin)
router.get('/', authorizeRoles('ADMIN'), StudentController.getAll);

// GET /api/students/:id — Ambil detail siswa
// Admin bisa lihat semua, Student cuma bisa lihat info sendiri
router.get('/:id', authorizeRoles('ADMIN', 'STUDENT'), StudentController.getById);

module.exports = router;
