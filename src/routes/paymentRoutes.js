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
  authorizeRoles('ADMIN', 'STUDENT'),
  validate(createPaymentSchema), 
  PaymentController.createTransaction
);

// POST /api/payments/webhook — Midtrans webhook callback
// PENTING: JANGAN DIBERI AUTHENTICATE KARENA INI DIPANGGIL OLEH SERVER MIDTRANS
// Keamanannya dijamin oleh Signature Verification di dalam PaymentService
router.post('/webhook', PaymentController.webhookHandler);

module.exports = router;
