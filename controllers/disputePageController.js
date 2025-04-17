'use strict';

const blockchainService = require('../services/blockchainService');

// 显示争议详情页
exports.showDisputeDetail = async (req, res) => {
    const { disputeId } = req.params;
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    try {
        console.log(`[Dispute Page] Fetching details for dispute ${disputeId}`);
        const dispute = await blockchainService.query('dispute_resolution', 'id', disputeId);

        if (!dispute) {
            return res.status(404).render('error', {
                title: '错误 - 未找到', 
                message: '未找到指定的争议记录。', 
                error: { status: 404 }, 
                user: req.session.user
            });
        }

        // TODO: 权限检查 - 确保当前用户是参与方或管理员
        const isParticipant = req.session.user.publicKey === dispute.plaintiffPublicKey || req.session.user.id === dispute.defendantId;
        const isAdmin = req.session.user.role === 'admin';
        if (!isParticipant && !isAdmin) {
             return res.status(403).render('error', {
                title: '错误 - 无权访问', 
                message: '您无权查看此争议的详情。', 
                error: { status: 403 }, 
                user: req.session.user
            });
        }

        // 获取订单信息（可选，用于显示关联信息）
        let order = global.orders.find(o => o.id === dispute.orderId);
        // 可选：如果本地找不到，尝试从链上查
        if (!order) {
             order = await blockchainService.query('order', 'id', dispute.orderId);
        }

        res.render('disputes/show', {
            title: `争议详情 #${disputeId.substring(0, 8)}`,
            dispute: dispute,
            order: order || { id: dispute.orderId }, // 传递订单信息
            user: req.session.user
        });

    } catch (error) {
        console.error(`[Dispute Page] Error loading dispute ${disputeId}:`, error);
        res.status(500).render('error', {
            title: '错误 - 服务器错误', 
            message: '加载争议详情时出错。', 
            error: error, 
            user: req.session.user
        });
    }
}; 