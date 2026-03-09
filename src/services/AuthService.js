// src/services/AuthService.js
// Service layer untuk Autentikasi (Login & JWT).
// Menggunakan bcrypt untuk keamanan password sesuai checklist penambahan.md

const prisma = require('../lib/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AuditLogService = require('./AuditLogService');

const AuthService = {
  /**
   * Proses login user.
   * Format payload JWT: { userId, role, studentId }
   * 
   * @param {string} email
   * @param {string} password 
   * @returns {Promise<Object>} Data user dan JWT token
   */
  async login(email, password) {
    // 1. Cari user berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: true // Sertakan data siswa jika role-nya STUDENT
      }
    });

    if (!user) {
      const error = new Error('Email atau password salah.');
      error.code = 'INVALID_CREDENTIALS';
      error.statusCode = 401;
      throw error;
    }

    // 2. Verifikasi password dengan bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const error = new Error('Email atau password salah.');
      error.code = 'INVALID_CREDENTIALS';
      error.statusCode = 401;
      throw error;
    }

    // 3. Validasi integritas akun student
    // Akun dengan role STUDENT harus terhubung ke profil student agar token punya studentId valid.
    if (user.role === 'STUDENT' && !user.student) {
      const error = new Error('Akun student belum terhubung ke data siswa. Hubungi admin.');
      error.code = 'STUDENT_PROFILE_NOT_LINKED';
      error.statusCode = 403;
      throw error;
    }

    if (user.role === 'STUDENT' && user.student && !user.student.isActive) {
      const error = new Error('Akun siswa tidak aktif.');
      error.code = 'STUDENT_INACTIVE';
      error.statusCode = 403;
      throw error;
    }

    // 4. Buat payload JWT
    const payload = {
      userId: user.id,
      role: user.role,
      studentId: user.student ? user.student.id : null,
      email: user.email
    };

    // 5. Generate token
    const secret = process.env.JWT_SECRET || 'secret_key_default_jangan_dipakai_di_prod';
    const token = jwt.sign(payload, secret, { expiresIn: '1d' });

    // Hapus password dari response return
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  },

  /**
   * Ganti password user yang sedang login.
   *
   * @param {number} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<Object>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      const error = new Error('User tidak ditemukan.');
      error.code = 'USER_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      const error = new Error('Password lama tidak sesuai.');
      error.code = 'INVALID_CURRENT_PASSWORD';
      error.statusCode = 401;
      throw error;
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      const error = new Error('Password baru harus berbeda dari password lama.');
      error.code = 'PASSWORD_MUST_BE_DIFFERENT';
      error.statusCode = 400;
      throw error;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: Number(userId) },
      data: { password: hashedNewPassword },
    });

    await AuditLogService.logAction({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'AUTH_CHANGE_PASSWORD',
      entity: 'USER',
      entityId: user.id,
    });

    return {
      message: 'Password berhasil diubah.',
    };
  }
};

module.exports = AuthService;
