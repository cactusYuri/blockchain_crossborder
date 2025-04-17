/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Contract } = require('fabric-contract-api');

// 定义争议状态
const DisputeStatus = {
    OPEN: 'OPEN', // 争议已发起
    EVIDENCE_SUBMISSION: 'EVIDENCE_SUBMISSION', // 证据收集中
    ARBITRATION: 'ARBITRATION', // 仲裁中
    RESOLVED: 'RESOLVED', // 已解决
    CLOSED: 'CLOSED' // 已关闭 (可能是解决后或撤销)
};

class DisputeResolutionContract extends Contract {

    // 初始化函数 (可选)
    async initLedger(ctx) {
        console.info('============= START : Initialize Dispute Ledger ===========');
        // 可以添加一些初始数据或设置
        console.info('============= END : Initialize Dispute Ledger ===========');
    }

    /**
     * 发起争议
     * @param {Context} ctx - The transaction context
     * @param {string} disputeId - 争议的唯一标识符 (例如，基于订单号和时间戳生成)
     * @param {string} orderId - 关联的订单ID
     * @param {string} initiatorId - 发起人ID (买家或卖家标识)
     * @param {string} respondentId - 被诉人ID
     * @param {string} reason - 争议原因
     * @param {string} initialEvidence - 初始证据描述或哈希
     * @param {string} timestamp - 发起时间戳
     */
    async initiateDispute(ctx, disputeId, orderId, initiatorId, respondentId, reason, initialEvidence, timestamp) {
        console.info('============= START : Initiate Dispute ===========');

        const disputeKey = `DISPUTE_${disputeId}`;
        const existingDispute = await ctx.stub.getState(disputeKey);
        if (existingDispute && existingDispute.length > 0) {
            throw new Error(`Dispute ${disputeId} already exists.`);
        }

        const dispute = {
            docType: 'Dispute',
            disputeId: disputeId,
            orderId: orderId,
            initiatorId: initiatorId,
            respondentId: respondentId,
            reason: reason,
            status: DisputeStatus.OPEN,
            arbitratorId: null, // 初始无仲裁员
            evidence: [
                { submitter: initiatorId, evidenceData: initialEvidence, timestamp: timestamp }
            ],
            ruling: null, // 初始无裁决
            history: [
                { action: 'INITIATED', actor: initiatorId, timestamp: timestamp, details: `Reason: ${reason}` }
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        await ctx.stub.putState(disputeKey, Buffer.from(JSON.stringify(dispute)));

        // 可选：触发链码事件通知相关方
        // ctx.stub.setEvent('DisputeInitiated', Buffer.from(JSON.stringify(dispute)));

        console.info(`Dispute ${disputeId} initiated successfully.`);
        console.info('============= END : Initiate Dispute ===========');
        return JSON.stringify(dispute);
    }

    /**
     * 提交证据
     * @param {Context} ctx - The transaction context
     * @param {string} disputeId - 争议ID
     * @param {string} submitterId - 证据提交者ID (必须是发起人或被诉人)
     * @param {string} evidenceData - 证据描述或哈希
     * @param {string} timestamp - 提交时间戳
     */
    async submitEvidence(ctx, disputeId, submitterId, evidenceData, timestamp) {
        console.info('============= START : Submit Evidence ===========');

        const disputeKey = `DISPUTE_${disputeId}`;
        const disputeBytes = await ctx.stub.getState(disputeKey);
        if (!disputeBytes || disputeBytes.length === 0) {
            throw new Error(`Dispute ${disputeId} does not exist.`);
        }

        const dispute = JSON.parse(disputeBytes.toString());

        // 校验提交者身份和争议状态
        if (submitterId !== dispute.initiatorId && submitterId !== dispute.respondentId) {
            throw new Error(`User ${submitterId} is not authorized to submit evidence for dispute ${disputeId}.`);
        }
        // 允许在 OPEN 或 EVIDENCE_SUBMISSION 状态下提交证据
        if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.EVIDENCE_SUBMISSION) {
             throw new Error(`Cannot submit evidence when dispute status is ${dispute.status}.`);
        }

        // 如果是首次提交证据（非发起人），可以将状态更新为 EVIDENCE_SUBMISSION
        if (dispute.status === DisputeStatus.OPEN && dispute.evidence.length === 1) {
             dispute.status = DisputeStatus.EVIDENCE_SUBMISSION;
        }


        const newEvidence = { submitter: submitterId, evidenceData: evidenceData, timestamp: timestamp };
        dispute.evidence.push(newEvidence);
        dispute.history.push({ action: 'SUBMIT_EVIDENCE', actor: submitterId, timestamp: timestamp, details: `Evidence: ${evidenceData.substring(0, 50)}...` });
        dispute.updatedAt = timestamp;

        await ctx.stub.putState(disputeKey, Buffer.from(JSON.stringify(dispute)));

        console.info(`Evidence submitted for dispute ${disputeId} by ${submitterId}.`);
        console.info('============= END : Submit Evidence ===========');
        return JSON.stringify(newEvidence);
    }

    /**
     * 指派仲裁员 (简化版，实际可能需要更复杂的授权逻辑)
     * @param {Context} ctx - The transaction context
     * @param {string} disputeId - 争议ID
     * @param {string} arbitratorId - 仲裁员ID
     * @param {string} assignerId - 指派操作者ID (需要权限验证)
     * @param {string} timestamp - 指派时间戳
     */
    async assignArbitrator(ctx, disputeId, arbitratorId, assignerId, timestamp) {
        console.info('============= START : Assign Arbitrator ===========');

        // 在实际应用中，需要严格验证 assignerId 的权限
        // 例如，检查调用者是否具有 'admin' 或 'arbitration_manager' 角色

        const disputeKey = `DISPUTE_${disputeId}`;
        const disputeBytes = await ctx.stub.getState(disputeKey);
        if (!disputeBytes || disputeBytes.length === 0) {
            throw new Error(`Dispute ${disputeId} does not exist.`);
        }

        const dispute = JSON.parse(disputeBytes.toString());

        // 确保争议处于适合指派仲裁员的状态
        if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.EVIDENCE_SUBMISSION) {
            throw new Error(`Cannot assign arbitrator when dispute status is ${dispute.status}.`);
        }
        if (dispute.arbitratorId) {
             throw new Error(`Dispute ${disputeId} already has an assigned arbitrator: ${dispute.arbitratorId}.`);
        }

        dispute.arbitratorId = arbitratorId;
        dispute.status = DisputeStatus.ARBITRATION; // 进入仲裁阶段
        dispute.history.push({ action: 'ASSIGN_ARBITRATOR', actor: assignerId, timestamp: timestamp, details: `Assigned to ${arbitratorId}` });
        dispute.updatedAt = timestamp;

        await ctx.stub.putState(disputeKey, Buffer.from(JSON.stringify(dispute)));

        console.info(`Arbitrator ${arbitratorId} assigned to dispute ${disputeId} by ${assignerId}.`);
        console.info('============= END : Assign Arbitrator ===========');
        return JSON.stringify({ disputeId: disputeId, arbitratorId: arbitratorId });
    }


    /**
     * 仲裁员做出裁决
     * @param {Context} ctx - The transaction context
     * @param {string} disputeId - 争议ID
     * @param {string} arbitratorId - 做出裁决的仲裁员ID (需验证)
     * @param {string} decision - 裁决结果 (e.g., 'FAVOR_INITIATOR', 'FAVOR_RESPONDENT', 'PARTIAL')
     * @param {string} justification - 裁决理由
     * @param {string} timestamp - 裁决时间戳
     */
    async makeRuling(ctx, disputeId, arbitratorId, decision, justification, timestamp) {
        console.info('============= START : Make Ruling ===========');

        const disputeKey = `DISPUTE_${disputeId}`;
        const disputeBytes = await ctx.stub.getState(disputeKey);
        if (!disputeBytes || disputeBytes.length === 0) {
            throw new Error(`Dispute ${disputeId} does not exist.`);
        }

        const dispute = JSON.parse(disputeBytes.toString());

        // 验证调用者是否是指定的仲裁员
        if (dispute.arbitratorId !== arbitratorId) {
            throw new Error(`User ${arbitratorId} is not the assigned arbitrator for dispute ${disputeId}.`);
        }
        // 确保争议处于仲裁状态
        if (dispute.status !== DisputeStatus.ARBITRATION) {
            throw new Error(`Cannot make ruling when dispute status is ${dispute.status}.`);
        }
        if (dispute.ruling) {
             throw new Error(`Dispute ${disputeId} already has a ruling.`);
        }

        dispute.ruling = {
            arbitratorId: arbitratorId,
            decision: decision,
            justification: justification,
            timestamp: timestamp
        };
        dispute.status = DisputeStatus.RESOLVED; // 标记为已解决
        dispute.history.push({ action: 'MAKE_RULING', actor: arbitratorId, timestamp: timestamp, details: `Decision: ${decision}. Justification: ${justification.substring(0, 50)}...` });
        dispute.updatedAt = timestamp;

        await ctx.stub.putState(disputeKey, Buffer.from(JSON.stringify(dispute)));

        // 可选：触发链码事件通知结果
        // ctx.stub.setEvent('DisputeResolved', Buffer.from(JSON.stringify(dispute)));

        console.info(`Ruling made for dispute ${disputeId} by arbitrator ${arbitratorId}. Decision: ${decision}`);
        console.info('============= END : Make Ruling ===========');
        return JSON.stringify(dispute.ruling);
    }

    /**
     * 获取争议详情
     * @param {Context} ctx - The transaction context
     * @param {string} disputeId - 争议ID
     */
    async getDisputeDetails(ctx, disputeId) {
        console.info('============= START : Get Dispute Details ===========');
        const disputeKey = `DISPUTE_${disputeId}`;
        const disputeBytes = await ctx.stub.getState(disputeKey);

        if (!disputeBytes || disputeBytes.length === 0) {
            // 可以选择抛出错误或返回 null/空对象
            // throw new Error(`Dispute ${disputeId} does not exist.`);
            console.info(`Dispute ${disputeId} not found.`);
            return null;
        }

        const dispute = JSON.parse(disputeBytes.toString());
        console.info(`Details retrieved for dispute ${disputeId}`);
        console.info('============= END : Get Dispute Details ===========');
        return disputeBytes.toString(); // 返回从账本读取的原始数据
    }

    // 可以添加其他辅助查询函数，例如：
    // async getDisputesByOrder(ctx, orderId) { ... }
    // async getDisputesByStatus(ctx, status) { ... }
    // async getDisputesAssignedToArbitrator(ctx, arbitratorId) { ... }

}

module.exports = DisputeResolutionContract; 