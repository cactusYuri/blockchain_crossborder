// services/traceabilityService.js
const fabricHelper = require('../utils/fabricHelper'); // 假设的 Fabric 辅助文件路径

const CHAINCODE_NAME = 'traceability'; // 链码名称
const CONTRACT_NAME = 'TraceabilityContract'; // 链码中的合约名称

/**
 * 调用链码记录溯源事件
 * @param {string} userId - 发起操作的用户标识（用于获取网络连接身份）
 * @param {string} productId - 商品 ID
 * @param {string} eventType - 事件类型
 * @param {object} eventData - 事件数据对象
 * @param {string} timestamp - 事件时间戳 (ISO 8601)
 * @returns {Promise<object>} - 记录的事件对象
 * @throws {Error} - 如果 Fabric 操作失败
 */
async function recordTraceEvent(userId, productId, eventType, eventData, timestamp) {
    let contract;
    try {
        // 假设 getContract 返回配置好的合约实例
        contract = await fabricHelper.getContract(userId, CHAINCODE_NAME, CONTRACT_NAME);

        console.log(`Submitting transaction: RecordEvent for product ${productId}`);
        const eventDataString = JSON.stringify(eventData); // 将对象转为字符串

        const resultBytes = await contract.submitTransaction(
            'RecordEvent',
            productId,
            eventType,
            eventDataString,
            timestamp
        );

        console.log(`Transaction RecordEvent committed successfully for product ${productId}`);
        // submitTransaction 返回的是 Buffer，需要转为字符串再解析
        const resultString = resultBytes.toString('utf8');
        return JSON.parse(resultString);

    } catch (error) {
        console.error(`Failed to submit transaction RecordEvent for product ${productId}: ${error}`);
        // 可以根据错误类型进行更细致的处理
        throw new Error(`Failed to record trace event: ${error.message}`);
    } finally {
        // 确保断开连接（如果 fabricHelper.getContract 包含了连接逻辑）
        // fabricHelper.disconnectGateway(); // 可能需要，取决于 fabricHelper 实现
    }
}

/**
 * 调用链码获取商品溯源历史
 * @param {string} userId - 发起操作的用户标识
 * @param {string} productId - 商品 ID
 * @returns {Promise<Array<object>>} - 商品的溯源事件历史数组
 * @throws {Error} - 如果 Fabric 操作失败或商品无历史记录
 */
async function getProductHistory(userId, productId) {
    let contract;
    try {
        contract = await fabricHelper.getContract(userId, CHAINCODE_NAME, CONTRACT_NAME);

        console.log(`Evaluating transaction: GetHistoryForProduct for product ${productId}`);

        const resultBytes = await contract.evaluateTransaction('GetHistoryForProduct', productId);

        console.log(`Transaction GetHistoryForProduct evaluated successfully for product ${productId}`);
        const resultString = resultBytes.toString('utf8');
        // 链码返回的是 JSON 字符串数组
        return JSON.parse(resultString);

    } catch (error) {
        console.error(`Failed to evaluate transaction GetHistoryForProduct for product ${productId}: ${error}`);
         // 检查是否是因为找不到商品而报错，可以根据链码返回的错误信息判断
        if (error.message.includes(`does not exist or has no history`)) {
             console.warn(`No history found for product ${productId}.`);
             return []; // 返回空数组表示没有历史记录
        }
        throw new Error(`Failed to get product history: ${error.message}`);
    } finally {
        // fabricHelper.disconnectGateway(); // 可能需要
    }
}

module.exports = {
    recordTraceEvent,
    getProductHistory,
}; 