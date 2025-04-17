const express = require('express');
const router = express.Router();
const traceabilityController = require('../controllers/traceabilityController');
// const authMiddleware = require('../middleware/auth'); // 引入你的认证中间件

// POST 请求，在指定商品下记录一个新的溯源事件
// 路径: /api/traceability/products/:productId/events
router.post('/products/:productId/events', 
    // authMiddleware.requireAuth, // 添加认证中间件
    traceabilityController.addTraceEvent
);

// GET 请求，获取指定商品的溯源历史
// 路径: /api/traceability/products/:productId/history
router.get('/products/:productId/history', 
    // authMiddleware.requireAuth, // 添加认证中间件 (可选，取决于是否需要登录才能查看)
    traceabilityController.getTraceHistory
);

module.exports = router; 