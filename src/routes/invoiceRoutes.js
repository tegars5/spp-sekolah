// src/routes/invoiceRoutes.js
// Route definitions untuk fitur Tagihan (Invoice).

const { Router } = require('express');
const InvoiceController = require('../controllers/InvoiceController');

const router = Router();

// POST /api/invoices — Generate tagihan baru
router.post('/', InvoiceController.create);

// GET /api/students/:studentId/invoices — dipasang di server.js via nested route

module.exports = router;
