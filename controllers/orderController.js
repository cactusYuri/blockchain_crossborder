'use strict'; // Optional, but good practice

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { saveData } = require('../utils/dataPersistence');

// 引入 Token 模拟器
const tokenSimulator = require('../simulators/tokenSimulator');

// 获取用户的所有订单 (保持不变，仍然读取 global.orders)
exports.getUserOrders = async (req, res) => { // Mark as async if querying service
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/auth/login');
  }
  const userId = req.session.user.id;

  try {
    const boughtOrders = global.orders.filter(order => order.buyerId === userId);
    const soldOrders = global.orders.filter(order => order.sellerId === userId);
    const userOrdersMap = new Map();
    boughtOrders.forEach(order => userOrdersMap.set(order.id, order));
    soldOrders.forEach(order => userOrdersMap.set(order.id, order));
    const userOrders = Array.from(userOrdersMap.values());

    const ordersWithDetails = userOrders.map(order => {
        const product = global.products.find(p => p.id === order.productId);
        const buyer = global.users.find(u => u.id === order.buyerId);
        const seller = global.users.find(u => u.id === order.sellerId);

        return {
        ...order,
        product: product ? {
            id: product.id,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl
        } : { name: '未知商品' },
        buyer: buyer ? { id: buyer.id, name: buyer.name } : { name: '未知买家' },
        seller: seller ? { id: seller.id, name: seller.name } : { name: '未知卖家' }
        };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('orders/index', {
        title: '我的订单 - VeriTrade Chain',
        orders: ordersWithDetails,
        user: req.session.user
    });

  } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).render('error', {
            title: '错误 - 获取订单失败', message: '无法加载您的订单列表',
            error: { status: 500, stack: error.stack || error.message }, user: req.session.user
       });
  }
};

// 创建新订单 (移除区块链调用)
exports.createOrder = async (req, res) => {
  const { productId, quantity, password } = req.body;
  const orderId = uuidv4();

  try {
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).render('error', { title: '错误 - 未授权', message: '未授权', error: { status: 401, stack: '创建订单需要登录' }, user: null });
    }
    const buyerId = req.session.user.id;

    if (!password) {
        return res.status(400).render('error', { title: '错误 - 请求无效', message: '购买商品需要提供密码', error: { status: 400, stack: '缺少密码' }, user: req.session.user });
    }

    const numQuantity = parseInt(quantity);
    if (isNaN(numQuantity) || numQuantity <= 0) {
        return res.status(400).render('error', { title: '错误 - 请求无效', message: '购买数量无效', error: { status: 400, stack: '数量必须是正整数' }, user: req.session.user });
    }

    const product = global.products.find(p => p.id === productId);
    if (!product) {
      return res.status(404).render('error', { title: '错误 - 未找到商品', message: '找不到要购买的商品', error: { status: 404, stack: '请求的商品不存在' }, user: req.session.user });
    }
    const seller = global.users.find(u => u.id === product.sellerId);
    if (!seller) {
        return res.status(500).render('error', { title: '错误 - 内部错误', message: '无法获取卖家信息以创建订单', error: { status: 500, stack: '找不到卖家信息' }, user: req.session.user });
    }
    const sellerId = seller.id;
    const totalPrice = product.price * numQuantity;

    console.log(`[Order Create ${orderId}] Attempting to escrow ${totalPrice} DEMO tokens from buyer ${buyerId}`);
    try {
        await tokenSimulator.transferToEscrow(buyerId, sellerId, orderId, totalPrice);
        console.log(`[Order Create ${orderId}] DEMO Token escrow successful.`);
        try {
            const currentBuyerBalance = tokenSimulator.getBalance(buyerId);
            console.log(`[Order Create ${orderId}] Buyer ${buyerId}'s current DEMO token balance after escrow: ${currentBuyerBalance}`);
            if (req.session.user && req.session.user.id === buyerId) {
                req.session.user.balance = currentBuyerBalance;
                console.log(`[Order Create ${orderId}] Updated session balance for user ${buyerId} to ${currentBuyerBalance}`);
            }
        } catch (e) {
            console.error(`[Order Create ${orderId}] Error fetching buyer balance after escrow:`, e);
        }
    } catch (tokenError) {
        console.error(`[Order Create ${orderId}] Token escrow failed:`, tokenError);
        const message = tokenError.message.includes('Insufficient DEMO token balance')
                      ? tokenError.message
                      : '支付处理失败，请检查您的 DEMO 代币余额或稍后再试。';
        return res.status(400).render('error', {
            title: '错误 - 支付失败',
            message: message,
            error: { status: 400, stack: tokenError.stack || tokenError.message },
            user: req.session.user
        });
    }

    // --- 直接保存本地订单记录 ---
    const txId = 'simulated-tx-' + crypto.randomBytes(8).toString('hex');
    console.log(`[Order Create ${orderId}] Skipping blockchain call, using simulated TX ID ${txId}.`);
    try {
        const newOrder = {
            id: orderId,
            buyerId: buyerId,
            productId: product.id,
            sellerId: sellerId,
            quantity: numQuantity,
            totalPrice,
            status: 'pending',
            createdAt: new Date(),
            blockchainTxId: txId
        };
        if (!global.orders) global.orders = [];
        global.orders.push(newOrder);
        saveData('orders', global.orders);
        console.log(`[Order Create ${orderId}] Local order record saved.`);
        res.redirect(`/orders/${orderId}`);
    } catch (localSaveError) {
        console.error(`[Order Create ${orderId}] CRITICAL: Error during local order save after successful payment! Attempting to refund escrow...`, localSaveError);
        try {
             await tokenSimulator.refundEscrowToBuyer(orderId);
             console.log(`[Order Create ${orderId}] Token escrow refunded successfully after local save failure.`);
             try {
                 const refundedBuyerBalance = tokenSimulator.getBalance(buyerId);
                 if (req.session.user && req.session.user.id === buyerId) {
                    req.session.user.balance = refundedBuyerBalance;
                    console.log(`[Order Create ${orderId}] Updated session balance for user ${buyerId} after refund to ${refundedBuyerBalance}`);
                 }
             } catch (e) {
                 console.error(`[Order Create ${orderId}] Error fetching buyer balance after refund:`, e);
             }
        } catch (refundError) {
             console.error(`[Order Create ${orderId}] CRITICAL: Failed to refund token escrow after local save failure! Manual intervention needed.`, refundError);
        }
        res.status(500).render('error', {
            title: '错误 - 订单创建失败',
            message: `订单支付已处理，但在保存订单记录时发生错误。资金已尝试退回。错误: ${localSaveError.message}`,
            error: { status: 500, stack: localSaveError.stack || localSaveError.message },
            user: req.session.user
        });
    }
  } catch (error) {
    console.error(`[Order Create ${orderId}] Unexpected top-level error:`, error);
    res.status(500).render('error', {
      title: '错误 - 内部错误',
      message: `创建订单时发生内部错误: ${error.message || '请重试'}`,
      error: { status: 500, stack: error.stack || error.message },
      user: req.session.user
    });
  }
};

// 查看单个订单详情 (移除争议查询)
exports.getOrderDetail = async (req, res) => {
  const orderId = req.params.id;
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/auth/login');
  }
  const user = req.session.user;

  // --- 直接从 global.orders 读取 --- 
  const order = global.orders ? global.orders.find(o => o.id === orderId) : null;
  if (!order) {
    // 添加日志，方便调试
    console.error(`[getOrderDetail] Order with ID ${orderId} not found in global.orders.`);
    return res.status(404).render('error', {
        title: '错误 - 未找到资源',
        message: '找不到订单',
        error: { status: 404, stack: '请求的订单不存在' },
        user: req.session.user
    });
  }

  const product = global.products ? global.products.find(p => p.id === order.productId) : null;
  if (!product) {
    console.warn(`[getOrderDetail] Product ${order.productId} for order ${orderId} not found in global.products.`);
  }

  const buyer = global.users ? global.users.find(u => u.id === order.buyerId) : null;
  const seller = global.users ? global.users.find(u => u.id === order.sellerId) : null;

  let disputes = [];
  console.log(`[Order Detail] Skipping blockchain dispute query for order ${orderId}.`);

  res.render('orders/show', {
    title: `订单详情 #${orderId.substring(0, 8)} - VeriTrade Chain`,
    order,
    // 确保即使找不到 product/buyer/seller，也传递一个默认对象或 null，避免 EJS 渲染错误
    product: product || { name: '未知商品', price: 0, imageUrl: '' }, 
    buyer: buyer || { name: '未知买家' },
    seller: seller || { name: '未知卖家' },
    disputes: disputes,
    user: req.session.user
  });
};

// 卖家发货 (直接更新本地状态)
exports.shipOrder = async (req, res) => {
  const orderId = req.params.id;
  try {
      const { trackingNumber, password } = req.body;

      if (!req.session.user || !req.session.user.id) {
           return res.status(401).render('error', { title: '错误 - 未授权', message: '未授权', error: { status: 401, stack: '需要登录才能发货' }, user: null });
      }
      const userId = req.session.user.id;

      if (!password) {
           return res.status(400).render('error', { title: '错误 - 请求无效', message: '发货操作需要提供密码', error: { status: 400, stack: '缺少密码' }, user: req.session.user });
      }
      // 密码验证模拟（注释掉实际检查）
      /* ... */

      console.log(`CONTROLLER: Attempting shipOrder for ${orderId} by user ${userId} (SIMULATED)`);

      // --- 直接查找并更新 global.orders ---
      if (!global.orders) {
          console.error("[shipOrder] global.orders is not initialized!");
          return res.status(500).render('error', { title: '错误 - 服务器内部错误', message: '订单数据未加载', error: { status: 500, stack: 'global.orders missing' }, user: req.session.user });
      }
      const orderIndex = global.orders.findIndex(o => o.id === orderId);
      if (orderIndex === -1) {
          console.error(`[shipOrder] Order ${orderId} not found in global.orders`);
          return res.status(404).render('error', { title: '错误 - 未找到资源', message: '找不到要发货的订单', error: { status: 404, stack: '订单不存在' }, user: req.session.user });
      }
      const orderToUpdate = global.orders[orderIndex];

      if (orderToUpdate.sellerId !== userId) {
          return res.status(403).render('error', { title: '错误 - 无权操作', message: '您不是此订单的卖家', error: { status: 403, stack: '无权发货' }, user: req.session.user });
      }
      // --- 关键：现在应该可以直接从 pending 发货 --- 
      if (orderToUpdate.status !== 'pending') {
          console.warn(`[shipOrder] Order ${orderId} is already in status ${orderToUpdate.status}, allowing shipment anyway for demo.`);
          // 对于演示，我们可能允许重试发货，或者直接忽略这个检查
          // return res.status(400).render('error', { title: '错误 - 操作无效', message: `订单当前状态为 ${orderToUpdate.status}，无法发货`, error: { status: 400, stack: '状态错误' }, user: req.session.user });
      }

      // 更新订单信息
      orderToUpdate.status = 'shipped';
      orderToUpdate.trackingNumber = trackingNumber || 'N/A';
      orderToUpdate.shippedAt = new Date();
      console.log(`[shipOrder] Updated order ${orderId} in memory to shipped.`);

      // --- 保存更新后的订单列表 ---
      try {
          saveData('orders', global.orders);
          console.log(`CONTROLLER: Local order ${orderId} status saved as shipped.`);
      } catch (saveError) {
           console.error(`CONTROLLER: CRITICAL: Error saving order ${orderId} after updating status to shipped!`, saveError);
           return res.status(500).render('error', {
               title: '错误 - 内部错误', message: '更新订单状态时保存失败，请联系管理员',
               error: { status: 500, stack: saveError.stack || saveError.message }, user: req.session.user
            });
      }

      res.redirect(`/orders/${orderId}`);

  } catch (error) {
     console.error(`CONTROLLER: Unexpected error during shipOrder for ${orderId}:`, error);
     res.status(500).render('error', {
         title: '错误 - 发货失败',
         message: `处理发货时发生意外错误: ${error.message}`,
         error: { status: 500, stack: error.stack || error.message },
         user: req.session.user
     });
  }
};

// 买家确认收货 (直接更新本地状态并释放 Token)
exports.confirmDelivery = async (req, res) => {
    const orderId = req.params.id;
    try {
        const { password } = req.body;

        if (!req.session.user || !req.session.user.id) {
            return res.status(401).render('error', { title: '错误 - 未授权', message: '未授权', error: { status: 401, stack: '需要登录才能确认收货' }, user: null });
        }
        const userId = req.session.user.id;

        if (!password) {
             return res.status(400).render('error', { title: '错误 - 请求无效', message: '确认收货操作需要提供密码', error: { status: 400, stack: '缺少密码' }, user: req.session.user });
        }
        // 密码验证模拟（注释掉实际检查）
        /* ... */

        console.log(`CONTROLLER: Attempting confirmDelivery for ${orderId} by user ${userId} (SIMULATED)`);

        // --- 直接查找并更新 global.orders ---
        if (!global.orders) {
             console.error("[confirmDelivery] global.orders is not initialized!");
            return res.status(500).render('error', { title: '错误 - 服务器内部错误', message: '订单数据未加载', error: { status: 500, stack: 'global.orders missing' }, user: req.session.user });
        }
        const orderIndex = global.orders.findIndex(o => o.id === orderId);
        if (orderIndex === -1) {
            console.error(`[confirmDelivery] Order ${orderId} not found in global.orders`);
            return res.status(404).render('error', { title: '错误 - 未找到资源', message: '找不到要确认收货的订单', error: { status: 404, stack: '订单不存在' }, user: req.session.user });
        }
        const orderToUpdate = global.orders[orderIndex];

        if (orderToUpdate.buyerId !== userId) {
            return res.status(403).render('error', { title: '错误 - 无权操作', message: '您不是此订单的买家', error: { status: 403, stack: '无权确认收货' }, user: req.session.user });
        }
        // --- 关键：现在应该可以从 shipped 确认收货 --- 
        if (orderToUpdate.status !== 'shipped') {
            console.warn(`[confirmDelivery] Order ${orderId} is in status ${orderToUpdate.status}, not 'shipped'. Allowing confirmation anyway for demo.`);
             // 对于演示，我们可能允许直接确认，或者忽略检查
            // return res.status(400).render('error', { title: '错误 - 操作无效', message: `订单当前状态为 ${orderToUpdate.status}，无法确认收货`, error: { status: 400, stack: '状态错误' }, user: req.session.user });
        }

        // 更新订单状态 (先在内存中改)
        orderToUpdate.status = 'delivered';
        orderToUpdate.deliveredAt = new Date();
        console.log(`[confirmDelivery] Updated order ${orderId} in memory to delivered.`);

        // --- 释放托管的 DEMO Token 给卖家 ---
        let tokenReleasedSuccessfully = false;
        try {
            console.log(`CONTROLLER: Attempting to release escrowed tokens for order ${orderId}`);
            await tokenSimulator.releaseFromEscrow(orderId);
            console.log(`CONTROLLER: Token escrow released successfully for order ${orderId}.`);
            tokenReleasedSuccessfully = true;

            // --- (可选) 更新卖家 Session 余额 ---
            try {
                const sellerId = orderToUpdate.sellerId;
                const sellerNewBalance = tokenSimulator.getBalance(sellerId);
                if (req.session.user && req.session.user.id === sellerId) {
                    req.session.user.balance = sellerNewBalance;
                    console.log(`[confirmDelivery] Updated seller ${sellerId}'s session balance to ${sellerNewBalance}`);
                }
            } catch (e) {
                console.error(`[confirmDelivery] Error fetching/updating seller session balance:`, e);
            }
            // ----------------------------------

        } catch (tokenReleaseError) {
            console.error(`CONTROLLER: CRITICAL: Failed to release token escrow for order ${orderId}! Payment not sent to seller.`, tokenReleaseError);
            // 标记状态，但不阻止流程完成
            orderToUpdate.status = 'delivery_confirmed_payment_failed';
            orderToUpdate.deliveryConfirmationError = tokenReleaseError.message;
        }

        // --- 保存更新后的订单列表 ---
         try {
            saveData('orders', global.orders);
            console.log(`CONTROLLER: Local order ${orderId} status saved as ${orderToUpdate.status}.`);
        } catch (saveError) {
           console.error(`CONTROLLER: CRITICAL: Error saving order ${orderId} after updating status to ${orderToUpdate.status}! Data might be lost.`, saveError);
           // 即使保存失败，也要尝试完成请求，但需要警告
           return res.status(500).render('error', {
               title: '错误 - 内部错误', message: `确认收货状态保存失败。支付状态: ${tokenReleasedSuccessfully ? '已释放' : '释放失败'}。请联系管理员。`,
               error: { status: 500, stack: saveError.stack || saveError.message }, user: req.session.user
            });
        }

        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        console.error(`CONTROLLER: Unexpected error during confirmDelivery for ${orderId}:`, error);
        res.status(500).render('error', {
            title: '错误 - 确认收货失败',
            message: `处理确认收货时发生意外错误: ${error.message}`,
            error: { status: 500, stack: error.stack || error.message },
            user: req.session.user
        });
    }
};

// 买家提交评价 (DEPRECATED - 保持不变)
exports.addReview = async (req, res) => {
    console.warn("DEPRECATED: /orders/:id/review route handler (addReview) was likely superseded by POST /api/reviews.");
    res.redirect(`/orders/${req.params.id}`);
};

// 可能还需要其他函数，例如确认收货 (如果它也触发区块链事件)
// exports.confirmDelivery = async (req, res) => { ... }; 