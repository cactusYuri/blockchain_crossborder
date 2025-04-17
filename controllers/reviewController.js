'use strict';

// 移除旧的本地合约依赖
// const ReputationContractLocal = require('../chaincode/reputation/reputation.js');
// 引入 blockchainService
const blockchainService = require('../services/blockchainService');
const crypto = require('crypto'); // 用于计算评论哈希

// 移除旧的实例
// const reputationSystem = new ReputationContractLocal();

// 控制器: 提交评价 - 使用 blockchainService
exports.submitReview = async (req, res) => {
    // 从 session 获取用户 ID
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const userId = req.session.user.id;
    // 从请求体获取数据
    const { orderId, rating, comment, password } = req.body;

    if (!orderId || rating === undefined || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields: orderId, rating, password' });
    }

    try {
        // 1. 根据 orderId 查找 sellerId (或 sellerPublicKey)
        // 优先查本地 global.orders (更快), 查不到再尝试查链状态 (更可靠但可能慢)
        let orderInfo = global.orders.find(o => o.id === orderId);
        let sellerId; // reputationSimulator 需要的是 sellerId
        
        if (orderInfo) {
             sellerId = orderInfo.sellerId;
        } else {
            // 尝试从链上查询订单信息
            console.warn(`[Review API] Order ${orderId} not found in global.orders, querying blockchain state...`);
            const chainOrderState = await blockchainService.query('order', 'id', orderId);
            if (chainOrderState && chainOrderState.sellerPublicKey) {
                // 需要从 publicKey 反查 sellerId (这可能需要修改 findUserByPublicKey 的逻辑)
                // 或者修改 reputationSimulator.submitReview 接受 sellerPublicKey?
                // **简化处理:** 假设我们能通过某种方式从 chainOrderState 获得 sellerId
                // **临时方案:** 我们假设 sellerPublicKey 就是 sellerId (在当前用户模型下可能成立?)
                 // **修改方案:** 让 reputationSimulator 接受 sellerPublicKey
                 // **当前选择:** 假设从 global.orders 能找到
                 return res.status(404).json({ success: false, message: '找不到对应的订单信息 (链上查询暂未完全支持反查SellerID)' });
            } else {
                 return res.status(404).json({ success: false, message: '找不到对应的订单信息' });
            }
        }

        if (!sellerId) { // 双重检查
             return res.status(404).json({ success: false, message: '无法确定订单的卖家信息' });
        }
        
        // 2. (可选) 计算评论哈希
        const commentHash = comment ? crypto.createHash('sha256').update(comment).digest('hex') : '';

        // 3. 调用 blockchainService 提交交易
        console.log(`API: Submitting review TX for order ${orderId} targeting seller ${sellerId} by user ${userId}`);
        const txId = await blockchainService.submitTransaction(
            userId,      // 提交者 (买家)
            password,    // 买家密码
            'reputation',// chaincodeName
            'SubmitReview',// functionName
            orderId,     // arg1
            sellerId,    // arg2 (需要确保 reputationSimulator 使用 sellerId)
            rating,      // arg3
            commentHash  // arg4
        );
        
        console.log(`API: Review transaction ${txId} submitted successfully.`);
        // 返回成功响应
        res.status(201).json({ success: true, message: '评价已提交', transactionId: txId });

    } catch (error) {
        console.error("API Error submitting review:", error);
        let statusCode = 500;
        let message = `提交评价时出错: ${error.message || '请重试'}`;
         if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            message = "密码错误，无法签名交易。";
        } else if (error.message.includes('already submitted')) { // 假设 simulator 会抛这个错
             statusCode = 409; // Conflict
             message = "您已评价过此订单。";
        } else if (error.message.includes('Invalid rating')) {
             statusCode = 400;
             message = "评分无效 (应为1-5)。";
        }
        res.status(statusCode).json({ success: false, message: message });
    }
};

// 控制器: 根据商家ID获取评价列表 - 让前端从 getMerchantReputation 获取
exports.getReviewsByMerchant = async (req, res) => {
    /* 注释掉或移除此方法，因为 getMerchantReputation 包含了评价列表
    const { merchantId } = req.params;
    if (!merchantId) { ... }
    try {
        // 可以修改为调用 blockchainService.query('reputation', merchantId, 'reviews')
        const reputationData = await blockchainService.query('reputation', merchantId);
        const reviews = reputationData ? reputationData.reviews : [];
        res.status(200).json({ success: true, reviews: reviews });
    } catch (error) { ... }
    */
   console.warn("API Endpoint GET /api/reviews/merchant/:merchantId is deprecated. Use GET /api/reviews/reputation/:merchantId instead.");
   res.status(410).json({ success: false, message: "Endpoint deprecated. Use /api/reviews/reputation/:merchantId instead." });
};

// 控制器: 获取商家信誉信息 - 使用 blockchainService
exports.getMerchantReputation = async (req, res) => {
    const { merchantId } = req.params; // 这里 merchantId 对应 sellerId

    if (!merchantId) {
        return res.status(400).json({ success: false, message: 'Merchant ID (Seller ID) is required' });
    }

    try {
        console.log(`API: Getting reputation for merchant ${merchantId}`);
        // 调用 blockchainService 查询
        const reputationData = await blockchainService.query('reputation', merchantId);
        
        if (!reputationData) {
            // 如果查询返回 null (例如 blockchainService 内部出错)
             console.log(`API: Reputation data not found or query failed for merchant ${merchantId}`);
             // 返回默认空状态，表示没有找到记录，但不一定是服务器错误
             return res.status(200).json({ 
                 success: true, 
                 merchantId: merchantId, 
                 reputation: { reviews: [], score: 0, count: 0 } 
             });
        } 
        // reputationData 应该就是 { reviews: [], score: 0, count: 0 } 结构
        console.log(`API: Reputation data retrieved for merchant ${merchantId}. Score: ${reputationData.score?.toFixed(2)}, Count: ${reputationData.count}`);
        res.status(200).json({ success: true, merchantId: merchantId, reputation: reputationData });

    } catch (error) {
        console.error("API Error getting merchant reputation:", error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get merchant reputation' });
    }
}; 