'use strict';

const fs = require('fs');
const path = require('path');
const { saveData, loadData } = require('../../utils/dataPersistence'); // 注意路径层级

const TRACEABILITY_DATA_FILE = 'traceabilityEvents'; // data/traceabilityEvents.json

class TraceabilitySimulator {
    constructor() {
        console.info('Initializing Traceability Simulator...');
        // Key: productId, Value: Array of trace events [{ txId, eventType, eventData, timestamp, actorPublicKey, signature }]
        this.traceEvents = new Map();
        this._loadData();
        console.info(`Traceability Simulator Initialized. Loaded data for ${this.traceEvents.size} products.`);
    }

    _loadData() {
        try {
            const loadedData = loadData(TRACEABILITY_DATA_FILE, {}); // Load as { productId: [events] }
            for (const productId in loadedData) {
                // Ensure it's an array before setting
                if (Array.isArray(loadedData[productId])) {
                     this.traceEvents.set(productId, loadedData[productId]);
                } else {
                    console.warn(`[TraceSim] Invalid data format for product ${productId} in ${TRACEABILITY_DATA_FILE}. Expected array.`);
                     this.traceEvents.set(productId, []); // Initialize as empty array
                }
            }
        } catch (error) {
            console.error('[TraceSim] Error loading traceability data:', error);
            if (!this.traceEvents) this.traceEvents = new Map();
        }
    }

    _saveData() {
        const dataToSave = Object.fromEntries(this.traceEvents);
        saveData(TRACEABILITY_DATA_FILE, dataToSave);
    }

    /**
     * 记录一个溯源事件 (由 blockchainService.processTransaction 调用)
     * @param {string} productId 商品ID (或其他唯一标识)
     * @param {string} eventType 事件类型 (e.g., 'MANUFACTURED', 'SHIPPED', 'CUSTOMS_CLEARED', 'RECEIVED')
     * @param {object} eventData 事件相关数据 (e.g., location, batchNumber, temperature)
     * @param {object} transactionDetails 包含 txId, timestamp, actorPublicKey, signature 的交易对象
     */
    recordEvent(productId, eventType, eventData, transactionDetails) {
        console.log(`[TraceSim] Recording event '${eventType}' for product ${productId}`);
        const { txId, timestamp, actorPublicKey, signature } = transactionDetails;

        if (!this.traceEvents.has(productId)) {
            this.traceEvents.set(productId, []);
        }

        const eventLog = this.traceEvents.get(productId);
        eventLog.push({
            txId: txId,
            eventType: eventType,
            eventData: eventData || {}, // 确保 eventData 是对象
            timestamp: timestamp, // 使用交易时间戳
            actorPublicKey: actorPublicKey, // 记录操作者公钥
            signature: signature // 记录交易签名以供验证 (虽然这里不验证)
        });

        this._saveData();
        console.log(`[TraceSim] Event recorded. Product ${productId} now has ${eventLog.length} events.`);
        return true;
    }

    /**
     * 获取指定商品的所有溯源事件
     * @param {string} productId 商品ID
     * @returns {Array} 溯源事件数组，如果找不到则为空数组
     */
    getTraceability(productId) {
        console.log(`[TraceSim] Querying traceability for product ${productId}`);
        return this.traceEvents.get(productId) || [];
    }
}

// 导出单例实例
module.exports = new TraceabilitySimulator(); 