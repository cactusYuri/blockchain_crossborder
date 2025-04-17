const express = require('express');
const router = express.Router();
const disputePageController = require('../controllers/disputePageController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// GET /disputes/:disputeId - 显示争议详情页
router.get('/:disputeId', isAuthenticated, disputePageController.showDisputeDetail);

module.exports = router; 