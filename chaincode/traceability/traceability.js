'use strict';

const { Contract } = require('fabric-contract-api');

class TraceabilityContract extends Contract {

    // 初始化函数（可选，通常用于设置初始数据）
    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        // 可以在这里添加一些初始的商品溯源数据作为示例
        console.info('============= END : Initialize Ledger ===========');
    }

    /**
     * 记录商品溯源事件
     * @param {Context} ctx - The transaction context
     * @param {string} productId - 商品的唯一标识符
     * @param {string} eventType - 事件类型 (e.g., 'CREATE', 'SHIP', 'RECEIVE')
     * @param {string} eventData - 事件相关数据 (JSON 格式字符串)
     * @param {string} timestamp - 事件发生的时间戳 (ISO 8601 格式)
     */
    async RecordEvent(ctx, productId, eventType, eventData, timestamp) {
        console.info('============= START : RecordEvent ===========');

        const event = {
            txId: ctx.stub.getTxID(), // 使用交易ID作为事件的唯一标识
            productId: productId,
            eventType: eventType,
            eventData: eventData, // 可以是JSON字符串描述细节
            timestamp: timestamp,
        };

        // 获取当前商品的历史记录
        const productHistoryBytes = await ctx.stub.getState(productId);
        let productHistory = [];
        if (productHistoryBytes && productHistoryBytes.length > 0) {
            productHistory = JSON.parse(productHistoryBytes.toString());
        }

        // 添加新事件
        productHistory.push(event);

        // 将更新后的历史记录写回账本
        await ctx.stub.putState(productId, Buffer.from(JSON.stringify(productHistory)));

        console.info(`Event recorded for product ${productId}: ${eventType}`);
        console.info('============= END : RecordEvent ===========');
        // 可以触发事件通知链码事件监听器（如果需要）
        // ctx.stub.setEvent('TraceEvent', Buffer.from(JSON.stringify(event)));
        return JSON.stringify(event);
    }

    /**
     * 获取指定商品的历史溯源记录
     * @param {Context} ctx - The transaction context
     * @param {string} productId - 商品的唯一标识符
     */
    async GetHistoryForProduct(ctx, productId) {
        console.info('============= START : GetHistoryForProduct ===========');
        const productHistoryBytes = await ctx.stub.getState(productId);

        if (!productHistoryBytes || productHistoryBytes.length === 0) {
            // 如果商品不存在或没有历史记录，可以抛出错误或返回空数组
            // throw new Error(`Product ${productId} does not exist or has no history`);
             console.info(`No history found for product ${productId}.`);
             return JSON.stringify([]); // 返回空数组的字符串表示
        }

        const productHistory = JSON.parse(productHistoryBytes.toString());
        console.info(`History retrieved for product ${productId}`);
        console.info('============= END : GetHistoryForProduct ===========');
        return productHistoryBytes.toString(); // 直接返回从账本读取的原始数据
    }

}

module.exports = TraceabilityContract; 