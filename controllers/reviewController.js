'use strict';

const ReputationContractLocal = require('../chaincode/reputation/reputation.js');

// 创建 ReputationContractLocal 的单例实例
// 这确保所有请求都作用于同一个内存状态和持久化文件
const reputationSystem = new ReputationContractLocal();

// 控制器: 提交评价
exports.submitReview = async (req, res) => {
    // 从请求体中获取数据
    // 注意：实际应用中需要获取当前登录用户的ID，而不是从请求体传递
    // 这里暂时假设 userId 从请求体传来，或者从 session/token 中获取
    const userId = req.body.userId || (req.session.user ? req.session.user.id : null);
    const { merchantId, orderId, rating, comment } = req.body;

    if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
    }
    if (!merchantId || !orderId || rating === undefined) {
        return res.status(400).json({ message: 'Missing required fields: merchantId, orderId, rating' });
    }

    try {
        console.log(`API: Submitting review for merchant ${merchantId} by user ${userId}`);
        // 调用本地模拟合约的方法
        const review = await reputationSystem.submitReview(userId, merchantId, orderId, rating, comment);
        console.log(`API: Review submitted successfully: ${review.reviewId}`);
        // 返回成功响应和创建的评价数据
        res.status(201).json(review);
    } catch (error) {
        console.error("API Error submitting review:", error);
        // 返回服务器错误
        res.status(500).json({ message: error.message || 'Failed to submit review' });
    }
};

// 控制器: 根据商家ID获取评价列表
exports.getReviewsByMerchant = async (req, res) => {
    const { merchantId } = req.params;

    if (!merchantId) {
        return res.status(400).json({ message: 'Merchant ID is required' });
    }

    try {
        console.log(`API: Getting reviews for merchant ${merchantId}`);
        // 调用本地模拟合约的方法
        const reviews = await reputationSystem.getReviewsByMerchant(merchantId);
        console.log(`API: Found ${reviews.length} reviews for merchant ${merchantId}`);
        // 返回评价列表
        res.status(200).json(reviews);
    } catch (error) {
        console.error("API Error getting reviews by merchant:", error);
        // 返回服务器错误
        res.status(500).json({ message: error.message || 'Failed to get reviews' });
    }
};

// 控制器: 获取商家信誉信息
exports.getMerchantReputation = async (req, res) => {
    const { merchantId } = req.params;

    if (!merchantId) {
        return res.status(400).json({ message: 'Merchant ID is required' });
    }

    try {
        console.log(`API: Getting reputation for merchant ${merchantId}`);
        // 调用本地模拟合约的方法
        const reputation = await reputationSystem.getMerchantReputation(merchantId);
        console.log(`API: Reputation data retrieved for merchant ${merchantId}`);
        // 返回信誉数据
        res.status(200).json(reputation);
    } catch (error) {
        console.error("API Error getting merchant reputation:", error);
        // 返回服务器错误
        res.status(500).json({ message: error.message || 'Failed to get merchant reputation' });
    }
}; 