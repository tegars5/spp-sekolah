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
const paymentRoutes = require('./routes/paymentRoutes');
const feeCategoryRoutes = require('./routes/feeCategoryRoutes');
const authRoutes = require('./routes/authRoutes');

// Import Middlewares
const errorHandler = require('./middlewares/errorHandler');

// Import Controllers (untuk nested route)
const InvoiceController = require('./controllers/InvoiceController');

const app = express();
const BASE_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = 5;

// --- Global Middlewares ---
app.use(cors());
app.use(express.json());

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fee-categories', feeCategoryRoutes);

// Nested route: GET /api/students/:studentId/invoices
app.get('/api/students/:studentId/invoices', InvoiceController.getByStudent);

// --- Centralized Error Handler (harus di paling akhir) ---
app.use(errorHandler);

// --- Start Server ---
function startServer(port, retriesLeft) {
  const server = app.listen(port);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
      startServer(port + 1, retriesLeft - 1);
      return;
    }

    process.stderr.write(`Server gagal dijalankan di port ${port}: ${error.message}\n`);
    process.exit(1);
  });
}

startServer(BASE_PORT, MAX_PORT_RETRIES);
