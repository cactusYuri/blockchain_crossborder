'use strict';

const fs = require('fs');
const path = require('path');

// Define paths for persistence files
const ordersDataPath = path.join(__dirname, '..', '..', 'data', 'orders.json');
const productsDataPath = path.join(__dirname, '..', '..', 'data', 'products.json');

// 重命名类，表明其本地同步作用
class OrderLocalSynchronizer {

    constructor() {
        console.info('Initializing Local Order Synchronizer with Persistence...');
        // Use Maps to simulate state
        this.orders = new Map();     // Key: orderId, Value: order object
        // this.products = new Map();   // 不再需要加载 products 用于验证
        this._loadData(); // Load existing data
        console.info('Local Order Synchronizer Initialized.');
    }

    // Load orders data
    _loadData() {
        try {
            // Load Orders
            if (fs.existsSync(ordersDataPath)) {
                const ordersData = fs.readFileSync(ordersDataPath, 'utf8');
                if (ordersData) {
                    const ordersJsonData = JSON.parse(ordersData);
                    if (Array.isArray(ordersJsonData)) {
                         ordersJsonData.forEach(order => this.orders.set(order.id, order));
                         console.info(`[Sync] Loaded ${this.orders.size} orders from ${ordersDataPath}`);
                    } else {
                         console.warn(`[Sync] Expected array in ${ordersDataPath}, but got ${typeof ordersJsonData}. Starting orders fresh.`);
                    }
                }
            } else {
                console.info(`[Sync] ${ordersDataPath} not found. Starting orders fresh.`);
            }
            // 不再需要加载 Products
        } catch (error) {
            console.error('Error loading data for OrderLocalSynchronizer:', error);
            console.warn('[Sync] Starting with potentially empty data due to load error.');
            if (!this.orders) this.orders = new Map();
        }
    }

    // Save orders data back to JSON file and update global state
    _saveOrders() {
        try {
            const ordersArray = Array.from(this.orders.values());
            const jsonData = JSON.stringify(ordersArray, null, 2);
            fs.writeFileSync(ordersDataPath, jsonData, 'utf8');
            // console.info(`[Sync] Orders data successfully saved to ${ordersDataPath}`);

            // --- 同步更新 global.orders --- 
            if (global.orders && Array.isArray(global.orders)) {
                this.orders.forEach((updatedOrder, orderId) => {
                    const index = global.orders.findIndex(o => o.id === orderId);
                    if (index !== -1) {
                        global.orders[index] = { ...updatedOrder }; 
                    } else {
                         // 如果是新订单，理论上不应在此处处理，而是在创建订单时添加
                        console.warn(`[Sync._saveOrders] Order ${orderId} found in synchronizer but not in global.orders.`);
                    }
                });
                // 处理 global.orders 中存在但 this.orders 中可能已被删除的情况 (如果需要)
                 // global.orders = global.orders.filter(o => this.orders.has(o.id));
                console.log('[Sync._saveOrders] Synced updates to global.orders.');
            } else {
                 console.warn('[Sync._saveOrders] global.orders not found or not an array, skipping sync.');
            }
            // -------------------------------

        } catch (error) {
            console.error(`[Sync] Error saving orders data or syncing global state:`, error);
        }
    }

    /**
     * 同步本地的发货状态 (假设权限和状态检查已在链上完成)
     * @param {string} orderId 订单ID
     * @param {string} trackingNumber 物流单号
     * @param {string} shippedAt ISO 格式的发货时间戳 (来自模拟链)
     * @returns {object} 更新后的本地订单对象
     * @throws {Error} 如果本地找不到订单
     */
    syncLocalShipment(orderId, trackingNumber, shippedAt) {
        console.info(`SYNC: Attempting to sync local shipment for order ${orderId}`);

        const order = this.orders.get(orderId);
        if (!order) {
            console.error(`SYNC Error: Order ${orderId} not found locally.`);
            throw new Error(`Local order with ID ${orderId} not found for sync.`);
        }

        // 直接更新状态和信息 (不再检查权限或当前状态)
        order.status = 'shipped';
        order.trackingNumber = trackingNumber || 'N/A';
        order.shippedAt = shippedAt || new Date().toISOString(); // 使用链上时间，若无则用当前时间

        this.orders.set(orderId, order);
        this._saveOrders(); // 持久化并同步 global.orders

        console.info(`SYNC: Local order ${orderId} successfully synced as shipped.`);
        return order;
    }

    /**
     * 同步本地的收货状态 (假设权限和状态检查已在链上完成)
     * @param {string} orderId 订单ID
     * @param {string} deliveredAt ISO 格式的收货时间戳 (来自模拟链)
     * @returns {object} 更新后的本地订单对象
     * @throws {Error} 如果本地找不到订单
     */
    syncLocalDelivery(orderId, deliveredAt) {
        console.info(`SYNC: Attempting to sync local delivery for order ${orderId}`);

        const order = this.orders.get(orderId);
        if (!order) {
            console.error(`SYNC Error: Order ${orderId} not found locally.`);
            throw new Error(`Local order with ID ${orderId} not found for sync.`);
        }

        // 直接更新状态和信息
        order.status = 'delivered';
        order.deliveredAt = deliveredAt || new Date().toISOString(); // 使用链上时间，若无则用当前时间

        this.orders.set(orderId, order);
        this._saveOrders(); // 持久化并同步 global.orders

        console.info(`SYNC: Local order ${orderId} successfully synced as delivered.`);
        return order;
    }

    // 未来可以添加其他本地数据查询或同步方法
    getLocalOrderById(orderId) {
        return this.orders.get(orderId);
    }
}

// 导出该类的单例实例，方便在 controller 中使用
module.exports = new OrderLocalSynchronizer(); 