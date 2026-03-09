// src/routes/invoiceRoutes.js
// Route definitions untuk fitur Tagihan (Invoice).
// Menerapkan Zod validation dan RBAC.

const { Router } = require('express');
const InvoiceController = require('../controllers/InvoiceController');
const {
  validate,
  createInvoiceSchema,
  bulkGenerateSchema,
  expireOverdueSchema,
} = require('../middlewares/validators');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// Wajib login
router.use(authenticate);

// POST /api/invoices — Generate tagihan baru (Hanya Admin)
router.post(
  '/', 
  authorizeRoles('ADMIN', 'TREASURER'), 
  validate(createInvoiceSchema), 
  InvoiceController.create
);

// POST /api/invoices/bulk — Bulk generate tagihan (Hanya Admin)
router.post(
  '/bulk', 
  authorizeRoles('ADMIN', 'TREASURER'), 
  validate(bulkGenerateSchema), 
  InvoiceController.bulkGenerate
);

// POST /api/invoices/expire-overdue — Tandai invoice overdue jadi EXPIRED (Admin)
router.post(
  '/expire-overdue',
  authorizeRoles('ADMIN', 'TREASURER'),
  validate(expireOverdueSchema),
  InvoiceController.expireOverdue
);

// GET /api/invoices/:id — Detail invoice (Admin & Student)
router.get('/:id', authorizeRoles('ADMIN', 'TREASURER', 'STUDENT'), InvoiceController.getById);

module.exports = router;
