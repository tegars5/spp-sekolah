// src/routes/auditLogRoutes.js
// Route audit logs (finance governance).

const { Router } = require('express');
const AuditLogController = require('../controllers/AuditLogController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const router = Router();

router.use(authenticate);
router.use(authorizeRoles('ADMIN', 'TREASURER'));

// GET /api/audit-logs?action=...&entity=...&actorUserId=...&limit=...
router.get('/', AuditLogController.list);

module.exports = router;
