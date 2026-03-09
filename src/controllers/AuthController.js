// src/controllers/AuthController.js
// Controller untuk endpoint autentikasi (/api/auth)

const AuthService = require('../services/AuthService');

const AuthController = {
  /**
   * POST /api/auth/login
   * Endpoint login untuk mendapatkan JWT Token.
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/auth/change-password
   * Endpoint untuk mengganti password user yang sedang login.
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await AuthService.changePassword(req.user.userId, currentPassword, newPassword);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = AuthController;
