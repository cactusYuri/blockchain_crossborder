// controllers/traceabilityController.js
const traceabilityService = require('../services/traceabilityService');

// POST /api/products/:productId/trace-events
async function addTraceEvent(req, res, next) {
    const { productId } = req.params;
    const { eventType, eventData } = req.body;
    // 假设用户 ID 存储在 session 或 token 中
    const userId = req.session?.userId || 'admin'; // 示例：需要替换为实际的用户身份获取逻辑
    const timestamp = new Date().toISOString(); // 使用当前时间作为时间戳

    if (!eventType || !eventData) {
        return res.status(400).json({ error: 'Missing required fields: eventType, eventData' });
    }

    try {
        const recordedEvent = await traceabilityService.recordTraceEvent(
            userId,
            productId,
            eventType,
            eventData, // eventData 应该是一个对象
            timestamp
        );
        res.status(201).json(recordedEvent);
    } catch (error) {
        console.error(`Error in addTraceEvent controller for product ${productId}:`, error);
        res.status(500).json({ error: 'Failed to record trace event', details: error.message });
    }
}

// GET /api/products/:productId/history
async function getTraceHistory(req, res, next) {
    const { productId } = req.params;
    const userId = req.session?.userId || 'admin'; // 示例：需要替换为实际的用户身份获取逻辑

    try {
        const history = await traceabilityService.getProductHistory(userId, productId);
        res.status(200).json(history);
    } catch (error) {
        console.error(`Error in getTraceHistory controller for product ${productId}:`, error);
        res.status(500).json({ error: 'Failed to get product history', details: error.message });
    }
}

module.exports = {
    addTraceEvent,
    getTraceHistory,
}; 