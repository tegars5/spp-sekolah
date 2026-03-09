// src/routes/invoiceRoutes.js
// Route definitions untuk fitur Tagihan (Invoice).
// Menerapkan Zod validation dan RBAC.

const { Router } = require('express');
const InvoiceController = require('../controllers/InvoiceController');
const { validate, createInvoiceSchema, bulkGenerateSchema } = require('../middlewares/validators');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// Wajib login
router.use(authenticate);

// POST /api/invoices — Generate tagihan baru (Hanya Admin)
router.post(
  '/', 
  authorizeRoles('ADMIN'), 
  validate(createInvoiceSchema), 
  InvoiceController.create
);

// POST /api/invoices/bulk — Bulk generate tagihan (Hanya Admin)
router.post(
  '/bulk', 
  authorizeRoles('ADMIN'), 
  validate(bulkGenerateSchema), 
  InvoiceController.bulkGenerate
);

module.exports = router;
