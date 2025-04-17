'use strict'; // Optional, but good practice

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const blockchainService = require('../services/blockchainService');
const { saveData } = require('../utils/dataPersistence');

// 在需要同步本地数据时 require
const orderLocalSynchronizer = require('../chaincode/order/orderContractLocal'); // <-- 修正回正确的文件名

// 引入 Token 模拟器
const tokenSimulator = require('../simulators/tokenSimulator');

// Assuming Order, Product, User models are loaded globally or via a different mechanism
// as the original code used global.orders, global.products etc.
// Let's remove any require('../data')

// 获取用户的所有订单 (需要适配新的用户/订单结构)
exports.getUserOrders = async (req, res) => { // Mark as async if querying service
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/auth/login'); // 修正路径
  }
  const userId = req.session.user.id;
  const userPublicKey = req.session.user.publicKey;

  try {
    // TODO: Ideally query blockchainService instead of global.orders
    // const boughtOrdersData = await blockchainService.query('order', 'buyer', userPublicKey);
    // const soldOrdersData = await blockchainService.query('order', 'seller', userPublicKey);

    // --- Start: Temporary logic using global.orders --- 
    // 暂时继续使用 global.orders 加载，因为 OrderContractLocal 目前只加载订单数据到实例内部
    // 后续可以重构为所有订单操作都通过 OrderContractLocal
    const boughtOrders = global.orders.filter(order => order.buyerId === userId);
    const soldOrders = global.orders.filter(order => order.sellerId === userId);
    const userOrdersMap = new Map();
    boughtOrders.forEach(order => userOrdersMap.set(order.id, order));
    soldOrders.forEach(order => userOrdersMap.set(order.id, order));
    const userOrders = Array.from(userOrdersMap.values());
    // --- End: Temporary logic using global.orders --- 

    // 丰富订单数据 (与之前类似，但数据源应为链上数据)
    const ordersWithDetails = userOrders.map(order => {
        const product = global.products.find(p => p.id === order.productId); // Still need local product details?
        const buyer = global.users.find(u => u.id === order.buyerId);
        const seller = global.users.find(u => u.id === order.sellerId);

        return {
        ...order,
        // Use local product info for display for now
        product: product ? { 
            id: product.id,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl
        } : { name: '未知商品' },
        buyer: buyer ? { id: buyer.id, name: buyer.name } : { name: '未知买家' },
        seller: seller ? { id: seller.id, name: seller.name } : { name: '未知卖家' }
        };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // 修正日期比较

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

// 创建新订单 (集成 Token 支付模拟)
exports.createOrder = async (req, res) => {
  const { productId, quantity, password } = req.body;
  const orderId = uuidv4(); // 在 try 外部生成，以便 catch 中可用

  try {
    // 检查登录
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).render('error', { title: '错误 - 未授权', message: '未授权', error: { status: 401, stack: '创建订单需要登录' }, user: null });
    }
    const buyerId = req.session.user.id;

    // 检查密码
    if (!password) {
        return res.status(400).render('error', { title: '错误 - 请求无效', message: '购买商品需要提供密码 (用于交易签名)', error: { status: 400, stack: '缺少密码' }, user: req.session.user });
    }
    // 验证 quantity
    const numQuantity = parseInt(quantity);
    if (isNaN(numQuantity) || numQuantity <= 0) {
        return res.status(400).render('error', { title: '错误 - 请求无效', message: '购买数量无效', error: { status: 400, stack: '数量必须是正整数' }, user: req.session.user });
    }

    // --- 查找产品和卖家信息 ---
    const product = global.products.find(p => p.id === productId);
    if (!product) {
      return res.status(404).render('error', { title: '错误 - 未找到商品', message: '找不到要购买的商品', error: { status: 404, stack: '请求的商品不存在' }, user: req.session.user });
    }
    const seller = global.users.find(u => u.id === product.sellerId);
    if (!seller || !seller.publicKey) {
        return res.status(500).render('error', { title: '错误 - 内部错误', message: '无法获取卖家信息以创建订单', error: { status: 500, stack: '找不到卖家公钥' }, user: req.session.user });
    }
    const sellerPublicKey = seller.publicKey;
    const sellerId = seller.id; // 获取卖家 ID

    // --- 计算总价 ---
    const totalPrice = product.price * numQuantity;

    // --- 步骤 1: 模拟 DEMO Token 支付 (转移到托管) ---
    console.log(`[Order Create ${orderId}] Attempting to escrow ${totalPrice} DEMO tokens from buyer ${buyerId}`);
    try {
        await tokenSimulator.transferToEscrow(buyerId, sellerId, orderId, totalPrice);
        console.log(`[Order Create ${orderId}] DEMO Token escrow successful.`);
    } catch (tokenError) {
        console.error(`[Order Create ${orderId}] Token escrow failed:`, tokenError);
        // 如果是因为余额不足，显示特定消息
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
    // -------------------------------------------------

    // --- 步骤 2: Token 托管成功，提交订单到模拟区块链 --- 
    const chaincodeName = 'order';
    const functionName = 'CreateOrder';
    const args = [
      orderId,
      product.blockchainProductId, // 注意: 确保 product 对象有 blockchainProductId 字段
      numQuantity.toString(),
      sellerPublicKey
    ];
    let txId;
    try {
      console.log(`[Order Create ${orderId}] Submitting signed transaction to blockchainService: ${chaincodeName}.${functionName}`);
      txId = await blockchainService.submitTransaction(
        buyerId,
        password, // 仍然需要密码来签名链上交易
        chaincodeName,
        functionName,
        ...args
      );
      console.log(`[Order Create ${orderId}] Blockchain transaction ${txId} submitted.`);

    } catch (blockchainError) {
        // 区块链交易失败，需要尝试回滚 Token 托管
        console.error(`[Order Create ${orderId}] Blockchain transaction submission failed:`, blockchainError);
        console.log(`[Order Create ${orderId}] Attempting to refund escrowed tokens...`);
        try {
             await tokenSimulator.refundEscrowToBuyer(orderId);
             console.log(`[Order Create ${orderId}] Token escrow refunded successfully.`);
        } catch (refundError) {
             console.error(`[Order Create ${orderId}] CRITICAL: Failed to refund token escrow after blockchain failure! Manual intervention needed.`, refundError);
             // 向用户显示一个更严重的错误，提示联系支持
        }
        
        let errorMessage = `订单记录到区块链时失败: ${blockchainError.message || '请重试'}`;
        if (blockchainError.message.includes("Incorrect password")) {
            errorMessage = "密码错误，无法签名订单创建交易。";
        }
        // 显示错误给用户
        return res.status(500).render('error', {
            title: '错误 - 订单创建失败',
            message: errorMessage + " (已尝试退回支付的代币)",
            error: { status: 500, stack: blockchainError.stack || blockchainError.message },
            user: req.session.user
        });
    }
    // -----------------------------------------------

    // --- 步骤 3: 区块链交易成功，保存本地订单记录 (不再处理用户余额) ---
    try {
        // **移除用户余额更新逻辑**
        // currentBuyer.balance = ...
        // currentSeller.balance = ...
        // req.session.user.balance = ...
        // saveData('users', global.users); 
        console.log(`[Order Create ${orderId}] Skipping user balance update in global.users.`);

        // 创建并保存本地订单记录 (与之前相同，但移除了余额字段)
        const newOrder = {
            id: orderId,
            buyerId: buyerId,
            productId: product.id,
            sellerId: sellerId, // 使用之前获取的 sellerId
            quantity: numQuantity,
            totalPrice,       // 仍然记录总价 (以 DEMO 计价)
            status: 'pending', 
            createdAt: new Date(),
            blockchainTxId: txId
        };
        if (!global.orders) global.orders = [];
        global.orders.push(newOrder);
        saveData('orders', global.orders); // 保存包含新订单的列表
        console.log(`[Order Create ${orderId}] Local order record saved.`);

        // 重定向到新创建的订单详情页
        res.redirect(`/orders/${orderId}`);

    } catch (localSaveError) {
        // 本地保存失败，但 Token 和链上都成功了
        console.error(`[Order Create ${orderId}] CRITICAL: Error during local order save after successful payment and blockchain TX!`, localSaveError);
        // 这是一个不一致状态，需要记录日志并可能需要手动干预
        res.status(500).render('error', {
            title: '错误 - 订单处理部分失败',
            message: `订单支付和区块链记录 (TX: ${txId}) 已成功，但在保存本地订单副本时发生错误。请凭订单号 ${orderId} 联系管理员。`, 
            error: { status: 500, stack: localSaveError.stack || localSaveError.message },
            user: req.session.user
        });
    }
    // -------------------------------------------------------

  } catch (error) {
    // 捕获意外的顶层错误 (例如查找产品之前发生的错误)
    console.error(`[Order Create ${orderId}] Unexpected top-level error:`, error);
    res.status(500).render('error', {
      title: '错误 - 内部错误',
      message: `创建订单时发生内部错误: ${error.message || '请重试'}`,
      error: { status: 500, stack: error.stack || error.message },
      user: req.session.user
    });
  }
};

// 查看单个订单详情
exports.getOrderDetail = async (req, res) => {
  const orderId = req.params.id;
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/auth/login');
  }
  const userId = req.session.user.id;
  const user = req.session.user; 

  const order = global.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).render('error', { 
        title: '错误 - 未找到资源',
        message: '找不到订单', 
        error: { status: 404, stack: '请求的订单不存在' },
        user: req.session.user
    });
  }

  const product = global.products.find(p => p.id === order.productId);
  if (!product) {
    console.warn(`[getOrderDetail] Product ${order.productId} for order ${orderId} not found.`);
  }

  const buyer = global.users.find(u => u.id === order.buyerId);
  const seller = global.users.find(u => u.id === order.sellerId);
  // const review = global.reviews ? global.reviews.find(r => r.orderId === orderId) : null; // 评价信息从信誉链码获取，这里不再需要

  // --- 获取订单关联的争议信息 --- 
  let disputes = [];
  try {
      console.log(`[Order Detail] Fetching disputes for order ${orderId}`);
      disputes = await blockchainService.query('dispute_resolution', 'orderId', orderId);
      disputes = disputes || []; // 确保是数组
      console.log(`[Order Detail] Found ${disputes.length} disputes for order ${orderId}`);
  } catch (error) {
      console.error(`[Order Detail] Failed to fetch disputes for order ${orderId}:`, error);
      // 查询失败，传递空数组
  }
  // ---------------------------

  res.render('orders/show', {
    title: `订单详情 #${orderId.substring(0, 8)} - VeriTrade Chain`,
    order,
    product, 
    buyer,
    seller,
    // review, // 移除旧的 review
    disputes: disputes, // <-- 传递争议列表给视图
    user: req.session.user 
  });
};

// 卖家发货 - 使用 blockchainService + 本地同步
exports.shipOrder = async (req, res) => {
  try {
      const orderId = req.params.id;
      // 从请求体获取密码和物流单号
      const { trackingNumber, password } = req.body; 
      
      if (!req.session.user || !req.session.user.id) {
           return res.status(401).render('error', { 
               title: '错误 - 未授权', message: '未授权', 
               error: { status: 401, stack: '需要登录才能发货' }, user: null 
            });
      }
      const userId = req.session.user.id; // 当前登录用户 ID (卖家)

      // **新增密码检查**
      if (!password) {
           return res.status(400).render('error', { 
               title: '错误 - 请求无效', message: '发货操作需要提供密码 (用于交易签名)', 
               error: { status: 400, stack: '缺少密码' }, user: req.session.user 
            });
      }

      console.log(`CONTROLLER: Attempting shipOrder for ${orderId} by user ${userId} via Blockchain Service`);
      
      // 1. 调用 blockchainService 提交模拟链上交易
      const txId = await blockchainService.submitTransaction(
          userId,
          password,            // <-- 使用从请求中获取的密码
          'order',             // chaincodeName
          'ConfirmShipment',   // functionName
          orderId,             // arg1
          trackingNumber       // arg2
      );
      console.log(`CONTROLLER: Blockchain transaction ${txId} submitted for shipping order ${orderId}.`);

      // 2. 模拟链上交易成功后，同步本地数据
      // 注意：实际应用中，链上确认可能需要时间，这里是即时同步
      try {
          // 查询模拟链上的最新状态来获取 shippedAt 时间戳 (可选，也可以在同步器内部生成)
          const chainOrderState = await blockchainService.query('order', 'id', orderId);
          const shippedAt = chainOrderState ? chainOrderState.shippedAt : new Date().toISOString();
          
          orderLocalSynchronizer.syncLocalShipment(orderId, trackingNumber, shippedAt);
          console.log(`CONTROLLER: Local order ${orderId} synced for shipment.`);
      } catch (syncError) {
          console.error(`CONTROLLER: Error syncing local order ${orderId} after blockchain TX ${txId}:`, syncError);
          // 即使本地同步失败，链上可能已成功，记录错误但继续
          // 可以考虑渲染一个带有警告信息的消息
      }

      // 3. 重定向到订单详情页
      res.redirect(`/orders/${orderId}`);

  } catch (error) {
     const orderIdForError = req.params.id; 
     console.error(`CONTROLLER: Error during shipOrder for ${orderIdForError}:`, error);
     
     let statusCode = 500;
     let errorMessage = `发货操作失败: ${error.message}`;
     if (error.message.includes("not found")) {
         statusCode = 404;
     } else if (error.message.includes("authorized") || error.message.includes("无权")) {
         statusCode = 403;
     } else if (error.message.includes("cannot be shipped") || error.message.includes("无效")) {
         statusCode = 400;
     } else if (error.message.includes("Incorrect password")) { // 处理密码错误
         statusCode = 400;
         errorMessage = "密码错误，无法签名发货交易。";
     }
     
     res.status(statusCode).render('error', {
         title: '错误 - 发货失败',
         message: errorMessage,
         error: { status: statusCode, stack: error.stack || error.message },
         user: req.session.user
     });
  }
};

// 买家确认收货 - 集成 Token 释放
exports.confirmDelivery = async (req, res) => {
    const orderId = req.params.id;
    try {
        const { password } = req.body; 
        
        if (!req.session.user || !req.session.user.id) {
            return res.status(401).render('error', { 
                title: '错误 - 未授权', message: '未授权', 
                error: { status: 401, stack: '需要登录才能确认收货' }, user: null 
            });
        }
        const userId = req.session.user.id; // 当前登录用户 ID (买家)

        if (!password) {
             return res.status(400).render('error', { 
                 title: '错误 - 请求无效', message: '确认收货操作需要提供密码 (用于交易签名)', 
                 error: { status: 400, stack: '缺少密码' }, user: req.session.user 
              });
        }

        console.log(`CONTROLLER: Attempting confirmDelivery for ${orderId} by user ${userId} via Blockchain Service`);
        
        // --- 步骤 1: 调用 blockchainService 提交模拟链上交易 --- 
        const txId = await blockchainService.submitTransaction(
            userId,
            password,          
            'order',           
            'ConfirmDelivery', 
            orderId            
        );
        console.log(`CONTROLLER: Blockchain transaction ${txId} submitted for delivering order ${orderId}.`);
        // -------------------------------------------------------

        // --- 步骤 2: 同步本地订单状态 --- 
        try {
            const chainOrderState = await blockchainService.query('order', 'id', orderId);
            const deliveredAt = chainOrderState ? chainOrderState.deliveredAt : new Date().toISOString();
            
            orderLocalSynchronizer.syncLocalDelivery(orderId, deliveredAt);
            console.log(`CONTROLLER: Local order ${orderId} synced for delivery.`);
        } catch (syncError) {
            console.error(`CONTROLLER: Error syncing local order ${orderId} after blockchain TX ${txId}:`, syncError);
            // 记录错误但继续，因为链上和支付是关键
        }
        // ---------------------------------

        // --- 步骤 3: 释放托管的 DEMO Token 给卖家 --- 
        try {
            console.log(`CONTROLLER: Attempting to release escrowed tokens for order ${orderId}`);
            await tokenSimulator.releaseFromEscrow(orderId);
            console.log(`CONTROLLER: Token escrow released successfully for order ${orderId}.`);
        } catch (tokenReleaseError) {
            console.error(`CONTROLLER: CRITICAL: Failed to release token escrow for order ${orderId} after delivery confirmation! Manual intervention needed.`, tokenReleaseError);
            // 这是一个严重错误，但订单流程已完成，可能需要向用户显示警告并记录
            // 可以考虑在重定向前添加一个 flash message 或类似机制
        }
        // -----------------------------------------
        
        // 步骤 4: 重定向到订单详情页
        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        // 处理来自 blockchainService 或其他地方的顶层错误
        const orderIdForError = req.params.id; 
        console.error(`CONTROLLER: Error during confirmDelivery for ${orderIdForError}:`, error);
        
        // 错误处理逻辑保持不变，但需要知道如果错误发生在 blockchainService 之前，则无需回滚 token
        let statusCode = 500;
        let errorMessage = `确认收货操作失败: ${error.message}`;
        if (error.message.includes("Incorrect password")) {
            statusCode = 400;
            errorMessage = "密码错误，无法签名确认收货交易。";
        }
        
        res.status(statusCode).render('error', {
            title: '错误 - 确认收货失败',
            message: errorMessage,
            error: { status: statusCode, stack: error.stack || error.message },
            user: req.session.user
        });
    }
};

// 买家提交评价 (DEPRECATED)
exports.addReview = async (req, res) => {
    console.warn("DEPRECATED: /orders/:id/review route handler (addReview) was likely superseded by POST /api/reviews.");
    try {
        const orderId = req.params.id;
        const { rating, comment } = req.body;

        if (!req.session.user || !req.session.user.id) {
             return res.status(401).render('error', { 
                 title: '错误 - 未授权', message: '未授权', 
                 error: { status: 401, stack: '需要登录才能评价' }, user: null 
             });
        }
        const userId = req.session.user.id; // 当前登录用户是评价者

        const order = global.orders.find(o => o.id === orderId);
        if (!order) { 
            return res.status(404).render('error', { 
                title: '错误 - 未找到资源', message: '找不到要评价的订单', 
                error: { status: 404, stack: '请求的订单不存在' }, user: req.session.user 
            }); 
        }

        // 权限检查：只有订单的买家可以评价
        if (userId !== order.buyerId) {
            return res.status(403).render('error', {
                title: '错误 - 无权操作', message: '无权操作',
                error: { status: 403, stack: '您不是此订单的买家，无法评价' },
                user: req.session.user
            });
        }

        // 检查订单状态是否允许评价 (例如，已发货或已送达 - 根据业务逻辑决定)
        // 注意：这里的状态检查可能需要与 ReputationContractLocal 中的逻辑保持一致或移除
        if (order.status !== 'shipped' && order.status !== 'delivered' && order.status !== 'reviewed' ) { // Example check, adjust status names if needed
             return res.status(400).render('error', {
                title: '错误 - 操作无效', message: '操作无效',
                error: { status: 400, stack: `订单状态为 ${order.status}，暂时无法评价` },
                user: req.session.user
             });
        }

        // 检查是否已评价 (这个检查应该由 ReputationContractLocal 处理，但可以保留作为双重检查)
        if (!global.reviews) global.reviews = []; // Ensure array exists
        // 这里可能需要调用 reputationSystem.getReviewsByMerchant(order.sellerId) 来检查更准确
        if (global.reviews.some(r => r.orderId === orderId && r.userId === userId)) {
             return res.status(400).render('error', {
                title: '错误 - 操作无效', message: '操作无效',
                error: { status: 400, stack: '您已评价过此订单' },
                user: req.session.user
             });
        }

        // *** 注意：以下代码现在应该由 /api/reviews 接口处理 ***
        // 调用 ReputationContractLocal.submitReview
        // ... 
        console.log(`[Order Review - DEPRECATED] Review for order ${orderId} might be handled by API. Skipping local save.`);
        // 暂时直接重定向，假设 API 会处理
        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        console.error('添加评价时出错 (DEPRECATED HANDLER): ', error);
         res.status(500).render('error', {
            title: '错误 - 内部错误', message: '添加评价失败',
            error: { status: 500, stack: error.stack || error.message },
            user: req.session.user
        });
    }
};

// 可能还需要其他函数，例如确认收货 (如果它也触发区块链事件)
// exports.confirmDelivery = async (req, res) => { ... }; 