'use strict';

const fs = require('fs');
const path = require('path');
const { saveData, loadData } = require('../utils/dataPersistence'); // 复用持久化工具

const TOKEN_DATA_FILE = 'tokenBalances'; // data/tokenBalances.json
const ESCROW_DATA_FILE = 'tokenEscrows';   // data/tokenEscrows.json

class TokenSimulator {
    constructor() {
        console.info('Initializing DEMO Token Simulator...');
        // 使用 Map 存储余额: Key: userId, Value: balance (number)
        this.balances = new Map();
        // 使用 Map 存储托管资金: Key: orderId, Value: { buyerId, sellerId, amount }
        this.escrows = new Map();

        this._loadData();
        console.info(`DEMO Token Simulator Initialized. Loaded ${this.balances.size} balances and ${this.escrows.size} escrows.`);
    }

    _loadData() {
        try {
            const loadedBalances = loadData(TOKEN_DATA_FILE, {}); // Load as object { userId: balance }
            for (const userId in loadedBalances) {
                this.balances.set(userId, Number(loadedBalances[userId]));
            }

            const loadedEscrows = loadData(ESCROW_DATA_FILE, {}); // Load as object { orderId: escrowInfo }
            for (const orderId in loadedEscrows) {
                this.escrows.set(orderId, loadedEscrows[orderId]);
            }
        } catch (error) {
            console.error('[TokenSim] Error loading token data:', error);
            // Ensure maps exist even if loading failed
            if (!this.balances) this.balances = new Map();
            if (!this.escrows) this.escrows = new Map();
        }
    }

    _saveBalances() {
        // Convert Map back to object for JSON storage
        const balancesObj = Object.fromEntries(this.balances);
        saveData(TOKEN_DATA_FILE, balancesObj);
    }

     _saveEscrows() {
        const escrowsObj = Object.fromEntries(this.escrows);
        saveData(ESCROW_DATA_FILE, escrowsObj);
    }

    // 初始化或给用户添加代币 (用于测试/演示)
    mintTokens(userId, amount) {
        console.log(`[TokenSim] Minting ${amount} DEMO to user ${userId}`);
        const currentBalance = this.balances.get(userId) || 0;
        if (isNaN(amount) || amount <= 0) {
             throw new Error('Invalid amount to mint.');
        }
        this.balances.set(userId, currentBalance + amount);
        this._saveBalances();
        console.log(`[TokenSim] User ${userId} new balance: ${this.balances.get(userId)}`);
    }

    getBalance(userId) {
        return this.balances.get(userId) || 0;
    }

    // 模拟将资金从买家转移到托管 (在创建订单时调用)
    transferToEscrow(buyerId, sellerId, orderId, amount) {
        console.log(`[TokenSim] Attempting to escrow ${amount} DEMO for order ${orderId} from ${buyerId} to ${sellerId}`);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount for escrow.');
        }
        if (this.escrows.has(orderId)) {
             throw new Error(`Escrow for order ${orderId} already exists.`);
        }

        const buyerBalance = this.getBalance(buyerId);
        if (buyerBalance < amount) {
            console.error(`[TokenSim] Insufficient balance for ${buyerId}. Needed: ${amount}, Has: ${buyerBalance}`);
            throw new Error(`Insufficient DEMO token balance. Needed: ${amount}, Available: ${buyerBalance}`);
        }

        // 从买家扣款
        this.balances.set(buyerId, buyerBalance - amount);
        // 记录托管信息
        this.escrows.set(orderId, { buyerId, sellerId, amount });

        // 持久化
        this._saveBalances();
        this._saveEscrows();

        console.log(`[TokenSim] Successfully escrowed ${amount} DEMO for order ${orderId}. Buyer ${buyerId} new balance: ${this.balances.get(buyerId)}`);
        return true;
    }

    // 模拟从托管释放资金给卖家 (在确认收货时调用)
    releaseFromEscrow(orderId) {
         console.log(`[TokenSim] Attempting to release escrow for order ${orderId}`);
         const escrowInfo = this.escrows.get(orderId);

         if (!escrowInfo) {
             console.error(`[TokenSim] Escrow for order ${orderId} not found.`);
             throw new Error(`Escrow for order ${orderId} not found. Cannot release funds.`);
         }

         const { sellerId, amount } = escrowInfo;
         const sellerBalance = this.getBalance(sellerId);

         // 给卖家加款
         this.balances.set(sellerId, sellerBalance + amount);
         // 移除托管记录
         this.escrows.delete(orderId);

         // 持久化
         this._saveBalances();
         this._saveEscrows();

         console.log(`[TokenSim] Successfully released ${amount} DEMO to seller ${sellerId} for order ${orderId}. Seller new balance: ${this.balances.get(sellerId)}`);
         return true;
    }

    // (可选) 模拟取消订单/争议失败，将托管资金退还给买家
    refundEscrowToBuyer(orderId) {
        console.log(`[TokenSim] Attempting to refund escrow for order ${orderId}`);
        const escrowInfo = this.escrows.get(orderId);

        if (!escrowInfo) {
            console.error(`[TokenSim] Escrow for order ${orderId} not found.`);
            throw new Error(`Escrow for order ${orderId} not found. Cannot refund funds.`);
        }

        const { buyerId, amount } = escrowInfo;
        const buyerBalance = this.getBalance(buyerId);

        // 给买家退款
        this.balances.set(buyerId, buyerBalance + amount);
        // 移除托管记录
        this.escrows.delete(orderId);

        // 持久化
        this._saveBalances();
        this._saveEscrows();

        console.log(`[TokenSim] Successfully refunded ${amount} DEMO to buyer ${buyerId} for order ${orderId}. Buyer new balance: ${this.balances.get(buyerId)}`);
        return true;
    }
}

// 导出单例实例
module.exports = new TokenSimulator(); 