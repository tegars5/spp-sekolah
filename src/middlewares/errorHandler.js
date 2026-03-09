// src/middlewares/errorHandler.js
// Centralized Error Handling Middleware
// Sesuai architect.md: "Gunakan class error khusus untuk menangani kegagalan transaksi."
// Sesuai skill.md: Format JSON konsisten { success, message, error_code }.

/**
 * Express error-handling middleware.
 * Menangkap semua error yang di-throw atau di-next() dari controller/service.
 */
function errorHandler(err, req, res, next) {
  // Tentukan status code (default 500 jika tidak di-set di error)
  const statusCode = err.statusCode || 500;

  // Kirim response JSON yang konsisten
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal server.',
    error_code: err.code || 'INTERNAL_SERVER_ERROR',
  });
}

module.exports = errorHandler;
