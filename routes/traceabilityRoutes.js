const express = require('express');
const router = express.Router();
const traceabilityController = require('../controllers/traceabilityController');
const { isAuthenticated } = require('../middleware/authMiddleware'); // 假设需要登录

// 添加溯源事件 (例如：卖家发货、物流更新等)
// 使用 :productId 作为参数，事件详情在 body 中
router.post('/:productId/events', isAuthenticated, traceabilityController.addTraceEvent);

// 查询商品溯源信息 (可以公开访问，或根据需要添加认证)
router.get('/:productId', traceabilityController.getTraceability);

module.exports = router; 