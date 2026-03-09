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
      const result = await PaymentService.createTransaction(invoiceId, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/payments/:orderId — Detail payment berdasarkan orderId.
   */
  async getByOrderId(req, res, next) {
    try {
      const payment = await PaymentService.getByOrderId(req.params.orderId, req.user);
      return res.status(200).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/payments?invoiceId=... — List payment.
   */
  async list(req, res, next) {
    try {
      const payments = await PaymentService.listPayments(req.user, req.query.invoiceId);
      return res.status(200).json({ success: true, data: payments });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payments/:orderId/reconcile?apply=true
   * Cek sinkronisasi status Midtrans vs DB, opsional terapkan update ke DB.
   */
  async reconcile(req, res, next) {
    try {
      const applyChanges = String(req.query.apply || 'false').toLowerCase() === 'true';
      const result = await PaymentService.reconcilePayment(req.params.orderId, req.user, applyChanges);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/payments/reconcile-pending?limit=20&apply=true
   * Rekonsiliasi batch payment status PENDING.
   */
  async reconcilePending(req, res, next) {
    try {
      const applyChanges = String(req.query.apply || 'false').toLowerCase() === 'true';
      const limit = req.query.limit || 20;
      const result = await PaymentService.reconcilePendingPayments(req.user, { limit, applyChanges });
      return res.status(200).json({ success: true, data: result });
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
