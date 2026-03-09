// src/routes/paymentRoutes.js
// Route definitions untuk fitur Pembayaran (Payment / Midtrans).
// Menerapkan RBAC pada endpoint internal dan membiarkan webhook terbuka.

const { Router } = require('express');
const PaymentController = require('../controllers/PaymentController');
const { validate, createPaymentSchema } = require('../middlewares/validators');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// POST /api/payments/charge — Buat transaksi & dapatkan Snap Token
// Wajib login (Admin & Student)
router.post(
  '/charge', 
  authenticate,
  authorizeRoles('ADMIN', 'TREASURER', 'STUDENT'),
  validate(createPaymentSchema), 
  PaymentController.createTransaction
);

// GET /api/payments?invoiceId=... — List payment (Admin & Student)
router.get(
  '/',
  authenticate,
  authorizeRoles('ADMIN', 'TREASURER', 'STUDENT'),
  PaymentController.list
);

// GET /api/payments/:orderId — Detail payment by orderId (Admin & Student)
router.get(
  '/:orderId',
  authenticate,
  authorizeRoles('ADMIN', 'TREASURER', 'STUDENT'),
  PaymentController.getByOrderId
);

// POST /api/payments/:orderId/reconcile?apply=true — Reconciliation Midtrans vs DB (Admin)
router.post(
  '/reconcile-pending',
  authenticate,
  authorizeRoles('ADMIN', 'TREASURER'),
  PaymentController.reconcilePending
);

router.post(
  '/:orderId/reconcile',
  authenticate,
  authorizeRoles('ADMIN', 'TREASURER'),
  PaymentController.reconcile
);

// POST /api/payments/webhook — Midtrans webhook callback
// PENTING: JANGAN DIBERI AUTHENTICATE KARENA INI DIPANGGIL OLEH SERVER MIDTRANS
// Keamanannya dijamin oleh Signature Verification di dalam PaymentService
router.post('/webhook', PaymentController.webhookHandler);

module.exports = router;
