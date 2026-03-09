// src/controllers/AuditLogController.js
// Controller untuk endpoint audit log.

const AuditLogService = require('../services/AuditLogService');

const AuditLogController = {
  /**
   * GET /api/audit-logs
   */
  async list(req, res, next) {
    try {
      const data = await AuditLogService.list({
        action: req.query.action,
        entity: req.query.entity,
        actorUserId: req.query.actorUserId,
        limit: req.query.limit,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = AuditLogController;
