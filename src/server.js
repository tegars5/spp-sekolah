// src/server.js
// Entry point aplikasi SPP-Sekolah.
// Hanya bertugas: setup Express, mount routes, dan jalankan server.
// Logika bisnis ada di Services, bukan di sini (sesuai architect.md).

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const studentRoutes = require('./routes/studentRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');

// Import Middlewares
const errorHandler = require('./middlewares/errorHandler');

// Import Controllers (untuk nested route)
const InvoiceController = require('./controllers/InvoiceController');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.use('/api/students', studentRoutes);
app.use('/api/invoices', invoiceRoutes);

// Nested route: GET /api/students/:studentId/invoices
app.get('/api/students/:studentId/invoices', InvoiceController.getByStudent);

// --- Centralized Error Handler (harus di paling akhir) ---
app.use(errorHandler);

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server SPP berjalan di http://localhost:${PORT}`);
});