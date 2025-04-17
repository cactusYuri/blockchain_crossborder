'use strict'; // Optional, but good practice

const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode'); // Use consistent variable name if needed later
const blockchainService = require('../services/blockchainService'); // 使用更新后的服务
const { saveData } = require('../utils/dataPersistence'); // 引入 saveData
// const crypto = require('crypto'); // No longer needed for direct signing here

// Assuming the Product model is loaded globally or via a different mechanism
// as the original code used global.products. Let's remove any require('../data')

// 获取所有产品
exports.getAllProducts = (req, res) => {
  res.render('products/index', {
    title: '商品列表 - VeriTrade Chain',
    products: global.products,
    user: req.session.user
  });
};

// 显示创建产品表单
exports.getNewProductForm = (req, res) => {
  res.render('products/new', {
    title: '发布新商品 - VeriTrade Chain',
    user: req.session.user,
    error: null
  });
};

// 创建新产品 (重写签名逻辑)
exports.createProduct = async (req, res) => {
  try {
    // 从请求体获取产品信息和 *密码* (!!! 仅用于模拟 !!!)
    const { name, description, price, imageUrl, origin, password } = req.body;

    // 检查登录状态
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).render('error', {
            title: '错误 - 未授权',
            message: '未授权', 
            error: { status: 401, stack: '创建产品需要登录' },
            user: null
        });
    }
    const userId = req.session.user.id;

    // !! 极度不安全的做法，仅用于模拟 !!
    if (!password) {
         return res.status(400).render('products/new', {
            title: '发布新商品 - VeriTrade Chain',
            user: req.session.user,
            error: '需要提供密码才能发布商品 (用于交易签名)',
            // Pass back form data if needed
            name, description, price, imageUrl, origin
        });
    }

    // 基本验证
     if (!name || !price) {
         return res.status(400).render('products/new', {
            title: '发布新商品 - VeriTrade Chain',
            user: req.session.user,
            error: '商品名称和价格不能为空',
             name, description, price, imageUrl, origin
        });
     }


    // 生成产品ID (应用本地ID)
    const productId = uuidv4();
    // 注意：区块链上的 "productId" 通常是链码内部生成的唯一标识或基于输入计算
    // 这里我们让 blockchainService 内部处理模拟链上的唯一性，或者传递一个ID
    // 为了与 traceability 保持一致，我们继续用 uuid 作为链上ID
    const blockchainProductId = uuidv4();
    // const creationTimestamp = Date.now(); // Use service's timestamp later

    // 创建本地产品对象 (用于前端展示和本地数据库)
    const newProduct = {
      id: productId, // 本地数据库ID
      sellerId: userId, // 使用用户ID
      name,
      description,
      price: parseFloat(price),
      imageUrl: imageUrl || 'https://via.placeholder.com/300',
      createdAt: new Date(), // 本地创建时间
      blockchainProductId, // 用于溯源的链上ID
      origin: origin || '未知产地',
      qrCodeData: null // 先置空
    };

    // 生成二维码数据URL (可以在区块链提交成功后再生成或同时进行)
    try {
        const traceUrl = `${req.protocol}://${req.get('host')}/trace/${blockchainProductId}`;
        newProduct.qrCodeData = await QRCode.toDataURL(traceUrl);
    } catch (qrError) {
        console.error("Failed to generate QR code:", qrError);
        // Decide if QR code failure should prevent product creation
    }


    // --- 准备并提交区块链交易 ---
    const chaincodeName = 'product'; // 链码名称
    const functionName = 'CreateProduct'; // 链码函数
    const args = [ // 传递给链码的原始业务参数
      blockchainProductId,
      newProduct.name,
      newProduct.price.toString(), // 价格转为字符串
      newProduct.description,
      newProduct.origin
    ];

    try {
      console.log(`[Product Create] Submitting signed transaction to blockchainService: ${chaincodeName}.${functionName}`);
      // 调用 blockchainService，它内部处理解密、签名和提交
      const txId = await blockchainService.submitTransaction(
        userId,
        password, // !! 传递密码，仅用于模拟 !!
        chaincodeName,
        functionName,
        ...args
      );

      console.log(`产品 ${newProduct.name} (ID: ${productId}) 的创建交易 ${txId} 已提交`);

      // 区块链提交成功后，再保存到本地数据库 (更健壮的做法)
      if (!global.products) global.products = []; // 确保数组存在
      global.products.push(newProduct);
      saveData('products', global.products); // 保存产品数据

      res.redirect(`/products/${productId}`);

    } catch (error) {
      console.error('区块链交易提交失败:', error);
      // 根据错误类型决定如何响应
      let errorMessage = `创建产品时区块链操作失败: ${error.message || '请重试'}`;
      if (error.message.includes("Incorrect password")) {
          errorMessage = "密码错误，无法签名交易。";
      }
      res.status(500).render('products/new', {
        title: '发布新商品 - VeriTrade Chain',
        user: req.session.user,
        error: errorMessage,
        name, description, price, imageUrl, origin // 回填表单数据
      });
    }
    // ----------------------------

  } catch (error) {
    // 捕获其他意外错误
    console.error('创建产品控制器时发生意外错误:', error);
    res.status(500).render('products/new', {
      title: '发布新商品 - VeriTrade Chain',
      user: req.session.user,
      error: `创建产品时发生内部错误: ${error.message || '请重试'}`
    });
  }
};

// 获取产品详情 (更新：传递卖家公钥)
exports.getProductDetail = (req, res) => {
  const productId = req.params.id;
  const product = global.products.find(p => p.id === productId);
  
  if (!product) {
    return res.status(404).render('error', {
      message: '找不到商品',
      error: { status: 404, stack: '请求的商品不存在' }
    });
  }
  
  // 找到卖家信息 (用 sellerId 查找)
  const seller = global.users.find(u => u.id === product.sellerId);
  
  res.render('products/show', {
    title: `${product.name} - VeriTrade Chain`,
    product,
    seller: seller ? { id: seller.id, name: seller.name, publicKey: seller.publicKey } : { name: '未知卖家' }, // 传递公钥
    user: req.session.user
  });
}; 