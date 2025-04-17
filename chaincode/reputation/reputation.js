'use strict';

const { Contract } = require('fabric-contract-api');

class ReputationContract extends Contract {

    async initLedger(ctx) {
        console.info('============= START : Initialize Reputation Ledger ===========');
        // 可以添加初始的信誉数据或配置
        console.info('============= END : Initialize Reputation Ledger ===========');
    }

    /**
     * 添加评价记录
     * @param {Context} ctx
     * @param {string} reviewId - 评价的唯一ID (可以由客户端生成或在此生成)
     * @param {string} orderId - 关联的订单ID
     * @param {string} sellerId - 被评价的卖家ID
     * @param {string} buyerId - 提交评价的买家ID
     * @param {number} rating - 评分 (e.g., 1-5)
     * @param {string} commentHash - 评论内容的哈希值 (避免存储大文本)
     * @param {string} timestamp - 评价提交的时间戳
     */
    async AddReviewRecord(ctx, reviewId, orderId, sellerId, buyerId, rating, commentHash, timestamp) {
        console.info('============= START : AddReviewRecord ===========');

        const review = {
            txId: ctx.stub.getTxID(),
            reviewId: reviewId,
            orderId: orderId,
            sellerId: sellerId,
            buyerId: buyerId,
            rating: parseInt(rating), // 确保是数字类型
            commentHash: commentHash,
            timestamp: timestamp,
        };

        // 使用复合键或特定模式来存储评价，以便于查询
        // 方案一：按卖家聚合 (像模拟代码一样)
        const sellerReviewsKey = `REVIEWS_${sellerId}`;
        const sellerReviewsBytes = await ctx.stub.getState(sellerReviewsKey);
        let sellerReviews = [];
        if (sellerReviewsBytes && sellerReviewsBytes.length > 0) {
            sellerReviews = JSON.parse(sellerReviewsBytes.toString());
        }
        sellerReviews.push(review);
        await ctx.stub.putState(sellerReviewsKey, Buffer.from(JSON.stringify(sellerReviews)));

        // 方案二：每个评价一个独立的键 (reviewId 作为 key)
        // await ctx.stub.putState(reviewId, Buffer.from(JSON.stringify(review)));
        // 这种方式查询某个卖家的所有评价会复杂些（需要范围查询或索引）

        console.info(`Review record added for seller ${sellerId} with ID ${reviewId}`);
        console.info('============= END : AddReviewRecord ===========');
        // ctx.stub.setEvent('ReviewEvent', Buffer.from(JSON.stringify(review)));
        return JSON.stringify(review);
    }

    /**
     * 获取指定卖家的所有评价记录
     * @param {Context} ctx
     * @param {string} sellerId - 卖家ID
     */
    async GetSellerReviews(ctx, sellerId) {
        console.info('============= START : GetSellerReviews ===========');

        // 根据上面 AddReviewRecord 选择的存储方案来查询
        // 对应方案一：
        const sellerReviewsKey = `REVIEWS_${sellerId}`;
        const sellerReviewsBytes = await ctx.stub.getState(sellerReviewsKey);

        if (!sellerReviewsBytes || sellerReviewsBytes.length === 0) {
            console.info(`No reviews found for seller ${sellerId}.`);
            return JSON.stringify([]);
        }

        console.info(`Reviews retrieved for seller ${sellerId}`);
        console.info('============= END : GetSellerReviews ===========');
        return sellerReviewsBytes.toString();

        // 如果使用方案二，这里需要使用范围查询或 CouchDB 查询
    }

    // 可以添加其他函数，例如计算平均评分、获取单个评价等
}

module.exports = ReputationContract; 