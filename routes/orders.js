const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// 获取用户的所有订单
router.get('/', isAuthenticated, orderController.getUserOrders);

// 创建新订单
router.post('/', isAuthenticated, orderController.createOrder);

// 查看单个订单详情
router.get('/:id', isAuthenticated, orderController.getOrderDetail);

// 卖家发货
router.post('/:id/ship', isAuthenticated, orderController.shipOrder);

// 买家确认收货
router.post('/:id/deliver', isAuthenticated, orderController.confirmDelivery);

// 买家提交评价 (DEPRECATED - Use /api/reviews)
router.post('/:id/review', isAuthenticated, orderController.addReview);

module.exports = router; 