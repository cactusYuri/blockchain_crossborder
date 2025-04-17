'use strict';

const fs = require('fs');
const path = require('path');
const { saveData, loadData } = require('../../utils/dataPersistence'); // 注意路径层级

const REPUTATION_DATA_FILE = 'reputationData'; // data/reputationData.json

class ReputationSimulator {
    constructor() {
        console.info('Initializing Reputation Simulator...');
        // Key: sellerId, Value: { reviews: [{ txId, orderId, buyerPublicKey, rating, commentHash, timestamp, signature }], score: number, count: number }
        this.reputationData = new Map();
        this._loadData();
        console.info(`Reputation Simulator Initialized. Loaded data for ${this.reputationData.size} sellers.`);
    }

    _loadData() {
        try {
            const loadedData = loadData(REPUTATION_DATA_FILE, {}); // Load as { sellerId: data }
            for (const sellerId in loadedData) {
                // Basic validation
                if (loadedData[sellerId] && Array.isArray(loadedData[sellerId].reviews)) {
                    this.reputationData.set(sellerId, loadedData[sellerId]);
                } else {
                     console.warn(`[RepSim] Invalid data format for seller ${sellerId} in ${REPUTATION_DATA_FILE}.`);
                     this.reputationData.set(sellerId, { reviews: [], score: 0, count: 0 });
                }
            }
        } catch (error) {
            console.error('[RepSim] Error loading reputation data:', error);
            if (!this.reputationData) this.reputationData = new Map();
        }
    }

    _saveData() {
        const dataToSave = Object.fromEntries(this.reputationData);
        saveData(REPUTATION_DATA_FILE, dataToSave);
    }

    /**
     * 提交一个评价 (由 blockchainService.processTransaction 调用)
     * @param {string} orderId 订单ID
     * @param {string} sellerId 卖家ID
     * @param {number} rating 评分 (e.g., 1-5)
     * @param {string} commentHash 评论内容的哈希 (可选，保护隐私)
     * @param {object} transactionDetails 包含 txId, timestamp, buyerPublicKey, signature 的交易对象
     */
    submitReview(orderId, sellerId, rating, commentHash, transactionDetails) {
        console.log(`[RepSim] Submitting review for order ${orderId} targeting seller ${sellerId}`);
        const { txId, timestamp, actorPublicKey: buyerPublicKey, signature } = transactionDetails; // 'from' is the buyer

        if (!this.reputationData.has(sellerId)) {
            this.reputationData.set(sellerId, { reviews: [], score: 0, count: 0 });
        }

        const sellerData = this.reputationData.get(sellerId);

        // 检查是否已评价过此订单 (简单检查，真实链码可能更复杂)
        if (sellerData.reviews.some(review => review.orderId === orderId)) {
            console.warn(`[RepSim] Review for order ${orderId} already exists. Ignoring.`);
            // 在真实链码中，这里应该抛出错误
            return false; // 或者 throw new Error('Review already submitted for this order.');
        }

        const numericRating = Number(rating);
        if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
             console.error(`[RepSim] Invalid rating: ${rating}. Must be between 1 and 5.`);
             throw new Error('Invalid rating provided.');
        }


        sellerData.reviews.push({
            txId: txId,
            orderId: orderId,
            buyerPublicKey: buyerPublicKey,
            rating: numericRating,
            commentHash: commentHash || '', // 评论哈希可选
            timestamp: timestamp,
            signature: signature
        });

        // 更新分数 (简单平均分)
        sellerData.count += 1;
        // 重新计算总分更安全
        const totalScore = sellerData.reviews.reduce((sum, review) => sum + review.rating, 0);
        sellerData.score = totalScore / sellerData.count;


        this._saveData();
        console.log(`[RepSim] Review recorded for seller ${sellerId}. New score: ${sellerData.score.toFixed(2)} (${sellerData.count} reviews).`);
        return true;
    }

    /**
     * 获取指定卖家的信誉数据 (包括评分和评价列表)
     * @param {string} sellerId 卖家ID
     * @returns {object|null} 信誉数据对象 { reviews, score, count } 或 null
     */
    getSellerReputation(sellerId) {
        console.log(`[RepSim] Querying reputation for seller ${sellerId}`);
        return this.reputationData.get(sellerId) || { reviews: [], score: 0, count: 0 }; // 返回默认结构
    }

     /**
      * 获取指定卖家的所有评价列表
      * @param {string} sellerId 卖家ID
      * @returns {Array} 评价列表
      */
     getSellerReviews(sellerId) {
         const reputation = this.getSellerReputation(sellerId);
         return reputation.reviews;
     }
}

// 导出单例实例
module.exports = new ReputationSimulator(); 