// controllers/traceabilityController.js
'use strict';

const blockchainService = require('../services/blockchainService');

// 添加溯源事件
exports.addTraceEvent = async (req, res) => {
    const { productId } = req.params;
    const { eventType, eventData, password } = req.body; // 需要事件类型、数据和密码

    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const userId = req.session.user.id;

    if (!eventType || !password) {
        return res.status(400).json({ success: false, message: '缺少必要的参数 (eventType, password)' });
    }

    try {
        console.log(`[Trace API] Attempting to add event '${eventType}' for product ${productId} by user ${userId}`);
        const txId = await blockchainService.submitTransaction(
            userId,
            password,
            'traceability',
            'RecordEvent',
            productId, // 链上 ID
            eventType,
            eventData || {} // 确保 eventData 是对象
        );
        console.log(`[Trace API] Traceability event recorded. TX ID: ${txId}`);
        res.status(201).json({ success: true, message: '溯源事件已记录', transactionId: txId });

    } catch (error) {
        console.error(`[Trace API] Error recording traceability event for ${productId}:`, error);
        let statusCode = 500;
        let message = `记录溯源事件时出错: ${error.message || '请重试'}`;
        if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            message = "密码错误，无法签名交易。";
        } else if (error.message.includes("not found")) {
             statusCode = 404; // 可能 productId 不存在？虽然链码层面没检查
             message = "关联的资源未找到。";
        }
        res.status(statusCode).json({ success: false, message: message });
    }
};

// 查询溯源信息
exports.getTraceability = async (req, res) => {
    const { productId } = req.params;
    try {
        console.log(`[Trace API] Querying traceability for product ${productId}`);
        // 注意: blockchainService.query 的参数与 key/subkey 设计有关
        // 根据 blockchainService.queryWorldState 的实现，查询 traceability 时 key 是 productId
        const events = await blockchainService.query('traceability', productId);

        if (!events) {
             // query 可能返回 null 或 []，统一处理
             console.log(`[Trace API] No traceability events found for product ${productId}`);
             return res.status(404).json({ success: false, message: '未找到该商品的溯源信息' });
        }
        
        // 如果 events 是空数组，也返回成功但数据为空
        console.log(`[Trace API] Found ${events.length} events for product ${productId}`);
        res.status(200).json({ success: true, productId: productId, events: events });

    } catch (error) {
        console.error(`[Trace API] Error querying traceability for ${productId}:`, error);
        res.status(500).json({ success: false, message: '查询溯源信息时出错' });
    }
}; 