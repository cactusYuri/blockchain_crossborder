const express = require('express');
const router = express.Router();
const traceController = require('../controllers/traceController');

// 通过区块链ID查看商品溯源信息
router.get('/:blockchainProductId', traceController.getProductTraceHistory);

module.exports = router; 