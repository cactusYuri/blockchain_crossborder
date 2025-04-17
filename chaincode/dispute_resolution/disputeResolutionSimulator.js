'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // 用于生成 disputeId
const { saveData, loadData } = require('../../utils/dataPersistence'); // 注意路径层级

const DISPUTE_DATA_FILE = 'disputeData'; // data/disputeData.json

class DisputeResolutionSimulator {
    constructor() {
        console.info('Initializing Dispute Resolution Simulator...');
        // Key: disputeId, Value: { disputeId, orderId, status ('OPEN', 'EVIDENCE_GATHERING', 'RESOLVED'), reason, plaintiffId (提出者), defendantId, evidence: [{ partyId, dataHash, timestamp, txId }], resolution: { arbiterId, decision, timestamp, txId }, createdAt, lastUpdatedAt, createTxId }
        this.disputes = new Map();
        this._loadData();
        console.info(`Dispute Resolution Simulator Initialized. Loaded ${this.disputes.size} disputes.`);
    }

    _loadData() {
        try {
            const loadedData = loadData(DISPUTE_DATA_FILE, {}); // Load as { disputeId: dispute }
            for (const disputeId in loadedData) {
                this.disputes.set(disputeId, loadedData[disputeId]);
            }
        } catch (error) {
            console.error('[DispSim] Error loading dispute data:', error);
            if (!this.disputes) this.disputes = new Map();
        }
    }

    _saveData() {
        const dataToSave = Object.fromEntries(this.disputes);
        saveData(DISPUTE_DATA_FILE, dataToSave);
    }

    /**
     * 开启一个新争议 (由 blockchainService.processTransaction 调用)
     * @param {string} orderId 关联的订单ID
     * @param {string} reason 争议原因
     * @param {string} defendantId 被诉方ID (买家或卖家)
     * @param {object} transactionDetails 包含 txId, timestamp, plaintiffPublicKey (提出者), signature 的交易对象
     */
    openDispute(orderId, reason, defendantId, transactionDetails) {
        const { txId, timestamp, actorPublicKey: plaintiffPublicKey, signature } = transactionDetails;
        const disputeId = uuidv4(); // 生成唯一的争议 ID
        console.log(`[DispSim] Opening new dispute ${disputeId} for order ${orderId}`);

        // TODO: 实际链码中应验证 plaintiffPublicKey 是否为订单的买家或卖家

        const newDispute = {
            disputeId: disputeId,
            orderId: orderId,
            status: 'OPEN',
            reason: reason,
            plaintiffPublicKey: plaintiffPublicKey,
            defendantId: defendantId, // 需要验证 defendantId 是否为订单的另一方
            evidence: [],
            resolution: null,
            createdAt: timestamp,
            lastUpdatedAt: timestamp,
            createTxId: txId
        };

        this.disputes.set(disputeId, newDispute);
        this._saveData();
        console.log(`[DispSim] Dispute ${disputeId} opened successfully.`);
        return disputeId; // 返回新创建的争议 ID
    }

     /**
     * 提交证据 (由 blockchainService.processTransaction 调用)
     * @param {string} disputeId 争议ID
     * @param {string} dataHash 证据数据的哈希 (实际数据应存储在链下)
     * @param {object} transactionDetails 包含 txId, timestamp, partyPublicKey (提交者), signature 的交易对象
     */
    submitEvidence(disputeId, dataHash, transactionDetails) {
        console.log(`[DispSim] Submitting evidence for dispute ${disputeId}`);
        const { txId, timestamp, actorPublicKey: partyPublicKey, signature } = transactionDetails;

        const dispute = this.disputes.get(disputeId);
        if (!dispute) {
            console.error(`[DispSim] Dispute ${disputeId} not found.`);
            throw new Error(`Dispute ${disputeId} not found.`);
        }

        // 实际链码应检查提交者是否为争议双方
        if (dispute.status !== 'OPEN' && dispute.status !== 'EVIDENCE_GATHERING') {
             console.warn(`[DispSim] Cannot submit evidence for dispute ${disputeId} in status ${dispute.status}.`);
             throw new Error(`Cannot submit evidence for dispute in status ${dispute.status}.`);
        }

        dispute.evidence.push({
            partyPublicKey: partyPublicKey,
            dataHash: dataHash,
            timestamp: timestamp,
            txId: txId,
            signature: signature
        });
        dispute.status = 'EVIDENCE_GATHERING'; // 更新状态
        dispute.lastUpdatedAt = timestamp;

        this._saveData();
        console.log(`[DispSim] Evidence submitted for dispute ${disputeId} by ${partyPublicKey.substring(0,10)}...`);
        return true;
    }

     /**
     * 解决争议 (由仲裁者调用, 由 blockchainService.processTransaction 调用)
     * @param {string} disputeId 争议ID
     * @param {string} decision 裁决结果描述
     * @param {object} transactionDetails 包含 txId, timestamp, arbiterPublicKey (仲裁者), signature 的交易对象
     */
    resolveDispute(disputeId, decision, transactionDetails) {
        console.log(`[DispSim] Resolving dispute ${disputeId}`);
         const { txId, timestamp, actorPublicKey: arbiterPublicKey, signature } = transactionDetails;

        const dispute = this.disputes.get(disputeId);
        if (!dispute) {
            console.error(`[DispSim] Dispute ${disputeId} not found.`);
            throw new Error(`Dispute ${disputeId} not found.`);
        }

        // 实际链码需要验证调用者是否有仲裁权限
        if (dispute.status === 'RESOLVED') {
            console.warn(`[DispSim] Dispute ${disputeId} is already resolved.`);
            return false; // 或者抛出错误
        }

        dispute.status = 'RESOLVED';
        dispute.resolution = {
            arbiterPublicKey: arbiterPublicKey,
            decision: decision,
            timestamp: timestamp,
            txId: txId,
            signature: signature
        };
        dispute.lastUpdatedAt = timestamp;

        this._saveData();
        console.log(`[DispSim] Dispute ${disputeId} resolved by ${arbiterPublicKey.substring(0,10)}... Decision: ${decision}`);
        // 注意：争议解决后可能需要触发其他操作，例如调用 tokenSimulator 退款或释放资金
        // 这个联动逻辑可以在 blockchainService.processTransaction 中处理，或者在这里返回特定结果
        return true;
    }


    /**
     * 获取指定争议的详情
     * @param {string} disputeId 争议ID
     * @returns {object|null} 争议对象或 null
     */
    getDispute(disputeId) {
        console.log(`[DispSim] Querying dispute ${disputeId}`);
        return this.disputes.get(disputeId) || null;
    }

     /**
     * 获取指定订单关联的所有争议
     * @param {string} orderId 订单ID
     * @returns {Array} 关联的争议列表
     */
    getDisputesByOrder(orderId) {
         console.log(`[DispSim] Querying disputes for order ${orderId}`);
         const relatedDisputes = [];
         for (const dispute of this.disputes.values()) {
             if (dispute.orderId === orderId) {
                 relatedDisputes.push(dispute);
             }
         }
         return relatedDisputes;
     }
}

// 导出单例实例
module.exports = new DisputeResolutionSimulator(); 