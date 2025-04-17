const express = require('express');
const router = express.Router();
const blockchainController = require('../controllers/blockchainController');
const authMiddleware = require('../middleware/authMiddleware');

// 区块链概览页面
router.get('/', authMiddleware.isAuthenticated, blockchainController.getBlockchainOverview);

// 区块列表
router.get('/blocks', authMiddleware.isAuthenticated, blockchainController.getAllBlocks);

// 区块详情
router.get('/blocks/:number', authMiddleware.isAuthenticated, blockchainController.getBlockDetail);

// 交易详情
router.get('/transactions/:id', authMiddleware.isAuthenticated, blockchainController.getTransactionDetail);

// 手动触发挖矿
router.post('/mine', authMiddleware.isAuthenticated, blockchainController.minePendingTransactions);

module.exports = router; 