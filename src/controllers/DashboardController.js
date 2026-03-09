// src/controllers/DashboardController.js
// Controller tipis untuk endpoint dashboard.

const DashboardService = require('../services/DashboardService');

const DashboardController = {
  /**
   * GET /api/dashboard/summary
   */
  async summary(req, res, next) {
    try {
      const data = await DashboardService.getSummary();
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = DashboardController;
