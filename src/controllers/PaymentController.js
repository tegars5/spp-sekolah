// src/controllers/PaymentController.js
// Controller tipis — hanya menangani request/response.
// Logika bisnis ada di PaymentService (sesuai architect.md).

const PaymentService = require('../services/PaymentService');

const PaymentController = {
  /**
   * POST /api/payments/charge — Buat transaksi dan dapatkan Snap Token.
   * Body sudah divalidasi oleh Zod middleware.
   */
  async createTransaction(req, res, next) {
    try {
      const { invoiceId } = req.body;
      const result = await PaymentService.createTransaction(invoiceId);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payments/webhook — Handler webhook dari Midtrans.
   * 
   * PENTING: Selalu return 200 ke Midtrans agar tidak retry terus.
   * Error handling dilakukan secara internal.
   */
  async webhookHandler(req, res) {
    try {
      const result = await PaymentService.handleWebhookNotification(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(200).json({
        status: 'error',
        message: error.message,
      });
    }
  },
};

module.exports = PaymentController;
