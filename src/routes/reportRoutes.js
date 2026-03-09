// src/routes/reportRoutes.js
// Route laporan untuk finance staff.

const { Router } = require('express');
const ReportController = require('../controllers/ReportController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'TREASURER'));

// GET /api/reports/finance?year=2026
router.get('/finance', ReportController.finance);
router.get('/finance.csv', ReportController.financeCsv);

// GET /api/reports/outstanding?limit=20
router.get('/outstanding', ReportController.outstanding);
router.get('/outstanding.csv', ReportController.outstandingCsv);

module.exports = router;
