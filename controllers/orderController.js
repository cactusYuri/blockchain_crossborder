'use strict'; // Optional, but good practice

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const blockchainService = require('../services/blockchainService'); // 使用更新后的服务
const { saveData } = require('../utils/dataPersistence'); // 引入 saveData

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

// 创建新订单 (添加支付逻辑)
exports.createOrder = async (req, res) => {
  try {
    const { productId, quantity, password } = req.body;

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

    // --- 查找买家信息并检查余额 ---
    const buyer = global.users.find(u => u.id === buyerId);
    if (!buyer) {
        // 理论上不应发生，因为用户已登录
         console.error(`[Order Create] Logged in user ${buyerId} not found in global.users!`);
         return res.status(500).render('error', { title: '错误 - 内部错误', message: '无法验证您的账户信息', error: { status: 500, stack: '买家账户数据丢失' }, user: req.session.user });
    }
    const buyerBalance = buyer.balance !== undefined ? buyer.balance : 0;
    const totalPrice = product.price * numQuantity;

    if (buyerBalance < totalPrice) {
        return res.status(400).render('error', {
            title: '错误 - 余额不足',
            message: `您的虚拟币余额不足以支付此订单 (需要: ${totalPrice.toLocaleString()}, 当前: ${buyerBalance.toLocaleString()})`,
            error: { status: 400, stack: '余额不足' },
            user: req.session.user
        });
    }
    // ----------------------------

    // --- 准备并提交区块链交易 (创建订单记录) ---
    const orderId = uuidv4();
    const chaincodeName = 'order';
    const functionName = 'CreateOrder';
    const args = [
      orderId,
      product.blockchainProductId,
      numQuantity.toString(),
      sellerPublicKey
    ];

    let txId;
    try {
      console.log(`[Order Create] Submitting signed transaction to blockchainService: ${chaincodeName}.${functionName}`);
      txId = await blockchainService.submitTransaction(
        buyerId,
        password,
        chaincodeName,
        functionName,
        ...args
      );
      console.log(`订单 (ID: ${orderId}) 的创建交易 ${txId} 已提交`);

    } catch (error) {
        // 区块链交易失败，无需处理余额
        console.error('创建订单时区块链交易提交失败:', error);
        let errorMessage = `创建订单时区块链操作失败: ${error.message || '请重试'}`;
        if (error.message.includes("Incorrect password")) {
            errorMessage = "密码错误，无法签名购买交易。";
        }
        return res.status(500).render('error', {
            title: '错误 - 订单创建失败',
            message: errorMessage,
            error: { status: 500, stack: error.stack || error.message },
            user: req.session.user
       });
    }
    // ------------------------------------

    // --- 区块链交易成功，处理余额变更和本地记录 ---
    try {
        // 再次获取最新的买家和卖家信息 (以防万一在挖矿期间被修改，虽然可能性低)
        const currentBuyer = global.users.find(u => u.id === buyerId);
        const currentSeller = global.users.find(u => u.id === seller.id);
        if (!currentBuyer || !currentSeller) {
             console.error(`[Order Create] Failed to find buyer or seller after TX commit! Buyer: ${!!currentBuyer}, Seller: ${!!currentSeller}`);
             // 这是一个严重的不一致状态，需要记录日志并可能需要手动干预
             // 暂时先完成订单创建，但不更新余额
             throw new Error("无法更新账户余额，请联系管理员。订单可能已创建。 Transaction ID: " + txId);
        }

        // 更新余额
        currentBuyer.balance = (currentBuyer.balance !== undefined ? currentBuyer.balance : 0) - totalPrice;
        currentSeller.balance = (currentSeller.balance !== undefined ? currentSeller.balance : 0) + totalPrice;

        // 更新买家 Session 余额
        req.session.user.balance = currentBuyer.balance;
        // 手动保存 session (可选，取决于 session store 配置，但通常是个好习惯)
        req.session.save(); 

        // 保存更新后的用户数据
        saveData('users', global.users);
        console.log(`[Order Create] Balances updated. Buyer: ${currentBuyer.balance}, Seller: ${currentSeller.balance}`);

        // 创建并保存本地订单记录
        const newOrder = {
            id: orderId,
            buyerId: buyerId,
            productId: product.id,
            sellerId: product.sellerId,
            quantity: numQuantity,
            totalPrice,
            status: 'PENDING',
            createdAt: new Date(),
            blockchainTxId: txId
        };
        if (!global.orders) global.orders = [];
        global.orders.push(newOrder);
        saveData('orders', global.orders);

        // 重定向到新创建的订单详情页
        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        // 处理余额更新或本地保存失败的情况
        console.error('[Order Create] Error during post-blockchain processing (balance update or local save):', error);
        // 此时区块链交易已成功，但本地状态可能不一致
        // 渲染一个特定的错误页面，提示用户联系支持
        res.status(500).render('error', {
            title: '错误 - 订单处理部分失败',
            message: `订单交易 ${txId} 已在区块链上记录，但在更新账户余额或本地订单时发生错误。请联系管理员。`, 
            error: { status: 500, stack: error.stack || error.message },
            user: req.session.user
        });
    }
    // ---------------------------------------

  } catch (error) {
    // 捕获意外错误 (例如在查找产品之前发生的错误)
    console.error('创建订单控制器时发生意外错误:', error);
    res.status(500).render('error', {
      title: '错误 - 内部错误',
      message: `创建订单时发生内部错误: ${error.message || '请重试'}`,
      error: { status: 500, stack: error.stack || error.message },
      user: req.session.user
    });
  }
};

// 查看单个订单详情 (基本不变，移除 userRole, 修正路径)
exports.getOrderDetail = (req, res) => {
  const orderId = req.params.id;
  if (!req.session.user || !req.session.user.id) {
    return res.redirect('/auth/login'); // 修正路径
  }
  const userId = req.session.user.id;

  // 查找订单 (使用本地 global.orders for now)
  // TODO: Query blockchainService for order details by ID
  const order = global.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).render('error', { 
        title: '错误 - 未找到资源',
        message: '找不到订单', 
        error: { status: 404, stack: '请求的订单不存在' },
        user: req.session.user
    });
  }

  // 查找产品 (本地)
  const product = global.products.find(p => p.id === order.productId);
   if (!product) {
    console.warn(`Order ${orderId} references missing product ${order.productId}`);
  }

  // 权限检查：只有买家和卖家可以查看订单
  if (userId !== order.buyerId && userId !== order.sellerId) {
    return res.status(403).render('error', {
      title: '错误 - 无权访问',
      message: '无权访问',
      error: { status: 403, stack: '您无权查看此订单' },
      user: req.session.user
    });
  }

  // 查找用户信息 (本地)
  const buyer = global.users.find(u => u.id === order.buyerId);
  const seller = global.users.find(u => u.id === order.sellerId);

  // 查找是否已有评价 (本地)
  const review = global.reviews ? global.reviews.find(r => r.orderId === orderId) : null; // Add null check

  res.render('orders/show', {
    title: `订单详情 #${orderId.substring(0, 8)} - VeriTrade Chain`,
    order,
    product, // 可能为 null
    buyer,
    seller,
    review,
    user: req.session.user // 传递 user
  });
};

// 卖家发货 (暂不修改签名逻辑，移除 isSeller 检查, 状态大写)
exports.shipOrder = async (req, res) => {
  try {
      const orderId = req.params.id;
      if (!req.session.user || !req.session.user.id) {
           return res.status(401).render('error', { 
               title: '错误 - 未授权', message: '未授权', 
               error: { status: 401, stack: '需要登录才能发货' }, user: null 
            });
      }
      const userId = req.session.user.id; // 当前登录用户
      const { trackingNumber } = req.body;

      const order = global.orders.find(o => o.id === orderId);
      if (!order) { 
          return res.status(404).render('error', { 
              title: '错误 - 未找到资源', message: '找不到订单', 
              error: { status: 404, stack: '请求的订单不存在' }, user: req.session.user 
          }); 
      }

      // 权限检查：只有订单的卖家可以发货
      if (userId !== order.sellerId) {
           return res.status(403).render('error', {
               title: '错误 - 无权操作', message: '无权操作',
               error: { status: 403, stack: '您不是此订单的卖家，无法发货' },
               user: req.session.user
           });
      }

      if (order.status !== 'PENDING') { // 使用大写状态
           return res.status(400).render('error', {
                title: '错误 - 操作无效', message: '操作无效',
                error: { status: 400, stack: `订单状态为 ${order.status}，无法发货` },
                user: req.session.user
            });
      }

      // 更新本地订单状态
      order.status = 'SHIPPED'; // 使用大写状态
      order.shippedAt = new Date();
      order.trackingNumber = trackingNumber || '未提供';
      saveData('orders', global.orders); // 保存订单更新

      // TODO: 未来可以添加签名并调用 blockchainService 记录 SHIPPED 事件
      // 例如: await blockchainService.submitTransaction(userId, password, 'order', 'ShipOrder', orderId, trackingNumber || '');
      console.log(`[Order Ship] Order ${orderId} marked as SHIPPED locally by user ${userId}. Blockchain update skipped for now.`);

      res.redirect(`/orders/${orderId}`);

  } catch (error) {
     console.error('发货时出错:', error);
     res.status(500).render('error', {
         title: '错误 - 内部错误', message: '发货操作失败',
         error: { status: 500, stack: error.stack || error.message },
         user: req.session.user
     });
  }
};

// 买家提交评价 (暂不修改签名逻辑，进行权限检查, 状态大写)
exports.addReview = async (req, res) => {
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
        if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') { // Example check
             return res.status(400).render('error', {
                title: '错误 - 操作无效', message: '操作无效',
                error: { status: 400, stack: `订单状态为 ${order.status}，暂时无法评价` },
                user: req.session.user
             });
        }

        // 检查是否已评价
        if (!global.reviews) global.reviews = []; // Ensure array exists
        if (global.reviews.some(r => r.orderId === orderId)) {
             return res.status(400).render('error', {
                title: '错误 - 操作无效', message: '操作无效',
                error: { status: 400, stack: '您已评价过此订单' },
                user: req.session.user
             });
        }

        // 计算评论哈希 (如果需要存储哈希而不是原文)
        const commentHash = comment ? crypto.createHash('sha256').update(comment).digest('hex') : null;
        const reviewId = uuidv4();

        // 保存评价到本地 (如果需要)
        const newReview = {
            id: reviewId,
            orderId: orderId,
            buyerId: userId,
            sellerId: order.sellerId,
            rating: parseInt(rating),
            comment: comment, // 暂时存储原文
            commentHash: commentHash,
            createdAt: new Date()
        };
        global.reviews.push(newReview);
        saveData('reviews', global.reviews); // 保存评价数据

        // TODO: 未来可以添加签名并调用 blockchainService.submitTransaction('reputation', 'AddReviewRecord', ...)
        // 例如: await blockchainService.submitTransaction(userId, password, 'reputation', 'AddReviewRecord', reviewId, orderId, order.sellerId, rating, commentHash)
        console.log(`[Order Review] Review for order ${orderId} added locally by user ${userId}. Blockchain update skipped for now.`);

        // 更新订单状态 (可选)
        order.status = 'REVIEWED'; // Example
        saveData('orders', global.orders); // 如果更新了订单状态，也要保存

        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        console.error('添加评价时出错:', error);
         res.status(500).render('error', {
            title: '错误 - 内部错误', message: '添加评价失败',
            error: { status: 500, stack: error.stack || error.message },
            user: req.session.user
        });
    }
};

// 可能还需要其他函数，例如确认收货 (如果它也触发区块链事件)
// exports.confirmDelivery = async (req, res) => { ... }; 