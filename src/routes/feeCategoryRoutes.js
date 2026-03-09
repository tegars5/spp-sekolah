// src/routes/feeCategoryRoutes.js
// Route definitions untuk Kategori Biaya.
// Menerapkan Zod validation dan RBAC.

const { Router } = require('express');
const FeeCategoryController = require('../controllers/FeeCategoryController');
const { validate, createFeeCategorySchema } = require('../middlewares/validators');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// Semua rute wajib login
router.use(authenticate);

// POST /api/fee-categories — Tambah kategori biaya baru (Hanya Admin)
router.post(
  '/', 
  authorizeRoles('ADMIN'), 
  validate(createFeeCategorySchema), 
  FeeCategoryController.create
);

// GET /api/fee-categories — Ambil semua kategori biaya (Admin & Student)
router.get(
  '/', 
  authorizeRoles('ADMIN', 'STUDENT'), 
  FeeCategoryController.getAll
);

module.exports = router;
