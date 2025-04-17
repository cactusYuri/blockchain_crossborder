const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware'); // 假设需要登录，解决争议需要管理员权限

// 开启新争议
router.post('/', isAuthenticated, disputeController.openDispute);

// 获取指定争议详情
router.get('/:disputeId', isAuthenticated, disputeController.getDispute);

// 获取指定订单的所有争议
router.get('/order/:orderId', isAuthenticated, disputeController.getDisputesByOrder);

// 为争议提交证据
router.post('/:disputeId/evidence', isAuthenticated, disputeController.submitEvidence);

// 解决争议 (假设只有管理员能解决)
router.post('/:disputeId/resolve', isAuthenticated, isAdmin, disputeController.resolveDispute);

module.exports = router; 