// src/routes/dashboardRoutes.js
// Route untuk dashboard finance staff.

const { Router } = require('express');
const DashboardController = require('../controllers/DashboardController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

// Semua endpoint dashboard wajib login finance staff
router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'TREASURER'));

// GET /api/dashboard/summary
router.get('/summary', DashboardController.summary);

module.exports = router;
