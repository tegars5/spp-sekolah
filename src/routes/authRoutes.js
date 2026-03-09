// src/routes/authRoutes.js
// Route untuk Autentikasi (Cuma ada Login untuk saat ini).

const { Router } = require('express');
const AuthController = require('../controllers/AuthController');
const { validate, loginSchema } = require('../middlewares/validators');

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), AuthController.login);

module.exports = router;
