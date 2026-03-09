// src/controllers/ReportController.js
// Controller tipis untuk laporan.

const ReportService = require('../services/ReportService');

const ReportController = {
  /**
   * GET /api/reports/finance?year=2026
   */
  async finance(req, res, next) {
    try {
      const year = req.query.year || new Date().getFullYear();
      const data = await ReportService.getFinanceReport(year);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/reports/outstanding?limit=20
   */
  async outstanding(req, res, next) {
    try {
      const limit = req.query.limit || 20;
      const data = await ReportService.getOutstandingReport(limit);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/reports/finance.csv?year=2026
   */
  async financeCsv(req, res, next) {
    try {
      const year = req.query.year || new Date().getFullYear();
      const csv = await ReportService.exportFinanceCsv(year);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="finance-report-${year}.csv"`);
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/reports/outstanding.csv?limit=20
   */
  async outstandingCsv(req, res, next) {
    try {
      const limit = req.query.limit || 20;
      const csv = await ReportService.exportOutstandingCsv(limit);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="outstanding-report.csv"');
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = ReportController;
