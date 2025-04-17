'use strict';

const express = require('express');
const reviewController = require('../controllers/reviewController');
// 可能需要引入认证中间件来保护提交评价的路由
// const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/reviews - 提交新评价
// 应该添加认证中间件，确保只有登录用户能提交
// router.post('/', authMiddleware.isAuthenticated, reviewController.submitReview);
router.post('/', reviewController.submitReview); // 暂时不加认证

// GET /api/reviews/merchant/:merchantId - 获取某个商家的所有评价
router.get('/merchant/:merchantId', reviewController.getReviewsByMerchant);

// GET /api/reviews/reputation/:merchantId - 获取某个商家的信誉信息
router.get('/reputation/:merchantId', reviewController.getMerchantReputation);

module.exports = router; 