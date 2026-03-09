// src/routes/authRoutes.js
// Route untuk Autentikasi (Cuma ada Login untuk saat ini).

const { Router } = require('express');
const AuthController = require('../controllers/AuthController');
const { authenticate } = require('../middlewares/authMiddleware');
const { validate, loginSchema, changePasswordSchema } = require('../middlewares/validators');

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), AuthController.login);

// PATCH /api/auth/change-password
router.patch(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  AuthController.changePassword
);

module.exports = router;
