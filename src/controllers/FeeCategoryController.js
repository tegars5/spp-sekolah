// src/controllers/FeeCategoryController.js
// Controller untuk kategori biaya.

const FeeCategoryService = require('../services/FeeCategoryService');

const FeeCategoryController = {
  async create(req, res, next) {
    try {
      const result = await FeeCategoryService.create(req.body, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const categories = await FeeCategoryService.getAll();
      return res.status(200).json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = FeeCategoryController;
