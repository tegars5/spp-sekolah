// src/middlewares/authMiddleware.js
// Middleware untuk mengecek JWT token dan hak akses (RBAC).

const jwt = require('jsonwebtoken');

/**
 * Middleware untuk memastikan user sudah login (memiliki token valid).
 * Berfungsi sebagai "satpam" tahap 1: Pengecekan Kredensial.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Akses ditolak. Token tidak ditemukan.',
      error_code: 'UNAUTHORIZED'
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'secret_key_default_jangan_dipakai_di_prod';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // Simpan data payload ke req.user agar bisa diakses controller
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid atau sudah kedaluwarsa.',
      error_code: 'INVALID_TOKEN'
    });
  }
}

/**
 * Middleware factory untuk membatasi akses berdasarkan role (RBAC).
 * Berfungsi sebagai "satpam" tahap 2: Pengecekan Hak Akses.
 * Harus dijalankan SETELAH middleware authenticate.
 * 
 * @param  {...string} allowedRoles - Daftar role yang diizinkan (e.g. 'ADMIN', 'STUDENT')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    // req.user di-set oleh middleware authenticate sebelumnya
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Anda tidak memiliki izin (Forbidden).',
        error_code: 'FORBIDDEN',
        required_roles: allowedRoles,
        your_role: req.user ? req.user.role : 'UNKNOWN'
      });
    }
    next();
  };
}

/**
 * Middleware untuk memastikan student hanya bisa mengakses data miliknya sendiri.
 * Admin dan Treasurer diizinkan mengakses semua data.
 *
 * @param {string} paramKey - Nama parameter route yang berisi studentId (default: 'id')
 */
function authorizeStudentSelfOrAdmin(paramKey = 'id') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token tidak ditemukan.',
        error_code: 'UNAUTHORIZED'
      });
    }

    if (req.user.role === 'ADMIN' || req.user.role === 'TREASURER') {
      return next();
    }

    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Role tidak diizinkan.',
        error_code: 'FORBIDDEN'
      });
    }

    const requestedStudentId = Number(req.params[paramKey]);
    if (!req.user.studentId || Number(req.user.studentId) !== requestedStudentId) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Anda hanya bisa mengakses data milik sendiri.',
        error_code: 'FORBIDDEN_STUDENT_SCOPE'
      });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorizeRoles,
  authorizeStudentSelfOrAdmin
};
