'use strict';

const blockchainService = require('../services/blockchainService');
const crypto = require('crypto'); // 可能用于计算证据哈希

// 开启新争议
exports.openDispute = async (req, res) => {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const userId = req.session.user.id; // 争议提出者
    const { orderId, reason, defendantId, password } = req.body;

    if (!orderId || !reason || !defendantId || !password) {
        return res.status(400).json({ success: false, message: '缺少必要参数 (orderId, reason, defendantId, password)' });
    }

    // TODO: 验证 defendantId 是否是订单的另一方

    try {
        console.log(`[Dispute API] User ${userId} opening dispute for order ${orderId}`);
        const disputeId = await blockchainService.submitTransaction(
            userId,         // 提出者
            password,
            'dispute_resolution',
            'OpenDispute',
            orderId,        // arg1
            reason,         // arg2
            defendantId     // arg3
        );
        // 注意: submitTransaction 返回的是 txId，而 openDispute 模拟器返回 disputeId
        // 我们需要修改 blockchainService 或模拟器，使其能返回业务 ID
        // **临时方案:** 暂时无法直接获取 disputeId，但操作已提交
         console.log(`[Dispute API] OpenDispute transaction submitted. TX ID: ${disputeId}`); // 这里 disputeId 变量名不准确，实际是 txId
        res.status(201).json({ success: true, message: '争议已开启 (处理中)', transactionId: disputeId }); // 返回 txId

    } catch (error) {
        console.error(`[Dispute API] Error opening dispute for order ${orderId}:`, error);
        // ... (错误处理)
         let statusCode = 500;
         let message = `开启争议失败: ${error.message || '请重试'}`;
         if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            message = "密码错误，无法签名交易。";
        }
         res.status(statusCode).json({ success: false, message: message });
    }
};

// 获取争议详情
exports.getDispute = async (req, res) => {
    const { disputeId } = req.params;
    // TODO: 权限检查，是否只有当事人或管理员能看？
    if (!req.session.user) { // 基本登录检查
         return res.status(401).json({ success: false, message: '未授权' });
    }
    try {
        const dispute = await blockchainService.query('dispute_resolution', 'id', disputeId);
        if (dispute) {
            // 可选：进一步检查当前用户是否有权查看此争议
            res.status(200).json({ success: true, dispute: dispute });
        } else {
            res.status(404).json({ success: false, message: '未找到指定的争议' });
        }
    } catch (error) {
        console.error(`[Dispute API] Error getting dispute ${disputeId}:`, error);
         res.status(500).json({ success: false, message: '查询争议详情失败' });
    }
};

// 获取订单的争议列表
exports.getDisputesByOrder = async (req, res) => {
     const { orderId } = req.params;
     // TODO: 权限检查
      if (!req.session.user) { // 基本登录检查
         return res.status(401).json({ success: false, message: '未授权' });
      }
     try {
        const disputes = await blockchainService.query('dispute_resolution', 'orderId', orderId);
         // 可选：检查用户是否有权查看此订单的争议
        res.status(200).json({ success: true, disputes: disputes || [] }); // 返回空数组如果没找到
     } catch (error) {
         console.error(`[Dispute API] Error getting disputes for order ${orderId}:`, error);
         res.status(500).json({ success: false, message: '查询订单争议失败' });
     }
};

// 提交证据
exports.submitEvidence = async (req, res) => {
     if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const userId = req.session.user.id;
    const { disputeId } = req.params;
    const { evidenceData, password } = req.body; // 假设前端传来原始数据或描述

    if (!evidenceData || !password) {
        return res.status(400).json({ success: false, message: '缺少必要参数 (evidenceData, password)' });
    }

    // 实际应用中，evidenceData 可能是文件上传，这里只取其哈希
    const dataHash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');

     try {
        // TODO: 检查 userId 是否是争议的一方
        console.log(`[Dispute API] User ${userId} submitting evidence for dispute ${disputeId}`);
        const txId = await blockchainService.submitTransaction(
            userId,
            password,
            'dispute_resolution',
            'SubmitEvidence',
            disputeId,  // arg1
            dataHash    // arg2
        );
        console.log(`[Dispute API] SubmitEvidence transaction submitted. TX ID: ${txId}`);
        res.status(200).json({ success: true, message: '证据已提交', transactionId: txId, evidenceHash: dataHash });

    } catch (error) {
         console.error(`[Dispute API] Error submitting evidence for dispute ${disputeId}:`, error);
         // ... (错误处理)
          let statusCode = 500;
          let message = `提交证据失败: ${error.message || '请重试'}`;
         if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            message = "密码错误，无法签名交易。";
        } else if (error.message.includes('not found')) {
             statusCode = 404;
             message = "争议不存在。";
        } else if (error.message.includes('Cannot submit evidence')) {
             statusCode = 400;
             message = "当前状态无法提交证据。";
        }
         res.status(statusCode).json({ success: false, message: message });
    }
};

// 解决争议 (管理员)
exports.resolveDispute = async (req, res) => {
     if (!req.session.user || !req.session.user.id) { // 由 isAdmin 中间件处理权限
        return res.status(401).json({ success: false, message: '未授权' });
    }
    const adminUserId = req.session.user.id; // 管理员 ID
    const { disputeId } = req.params;
    const { decision, password } = req.body; // 需要裁决结果和管理员密码

    if (!decision || !password) {
        return res.status(400).json({ success: false, message: '缺少必要参数 (decision, password)' });
    }

     try {
        console.log(`[Dispute API] Admin ${adminUserId} resolving dispute ${disputeId}`);
        const txId = await blockchainService.submitTransaction(
            adminUserId,
            password,
            'dispute_resolution',
            'ResolveDispute',
            disputeId,  // arg1
            decision    // arg2
        );
        console.log(`[Dispute API] ResolveDispute transaction submitted. TX ID: ${txId}`);
        // 注意：链上状态更新后，资金流转（退款或释放）应该由 blockchainService.processTransaction 自动处理

        res.status(200).json({ success: true, message: '争议已解决', transactionId: txId });

    } catch (error) {
         console.error(`[Dispute API] Error resolving dispute ${disputeId}:`, error);
         // ... (错误处理)
          let statusCode = 500;
          let message = `解决争议失败: ${error.message || '请重试'}`;
         if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            message = "密码错误，无法签名交易。";
        } else if (error.message.includes('not found')) {
             statusCode = 404;
             message = "争议不存在。";
        } else if (error.message.includes('already resolved')) {
             statusCode = 409;
             message = "争议已被解决。";
        }
          res.status(statusCode).json({ success: false, message: message });
    }
}; 