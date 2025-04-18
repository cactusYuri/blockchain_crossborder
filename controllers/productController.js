'use strict'; // Optional, but good practice

const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode'); // Use consistent variable name if needed later
const blockchainService = require('../services/blockchainService'); // 使用更新后的服务
const { saveData } = require('../utils/dataPersistence'); // 引入 saveData
// const crypto = require('crypto'); // No longer needed for direct signing here

// 引入 multer 和 path
const multer = require('multer');
const path = require('path');

// 确保 public/uploads/products 目录存在
const fs = require('fs');
const uploadDir = 'public/uploads/products/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); 
  },
  filename: function (req, file, cb) {
    // 使用 时间戳-原始文件名 的格式，避免重名
    cb(null, Date.now() + '-' + path.extname(file.originalname)); // 仅保留扩展名，文件名用时间戳
  }
});

// 文件过滤器，只接受图片
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件!'), false);
    }
};

// 创建 multer 实例，限制只上传一个名为 'imageFile' 的文件，并添加文件过滤
// 将 upload 导出或放在路由配置中
// const upload = multer({ storage: storage, fileFilter: imageFilter }).single('imageFile');

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
    // 注意：文件上传后，文本字段在 req.body，文件信息在 req.file
    // const { name, description, price, imageUrl, origin, password } = req.body; // imageUrl 仍然可能从表单URL字段传来
    // 由于 multer 中间件会在路由层使用，这里直接从 req.body 和 req.file 取值
    const { name, description, price, imageUrl: bodyImageUrl, origin, password } = req.body; 

    let finalImageUrl = 'https://via.placeholder.com/300'; // 默认图片

    if (req.file) {
      // 如果有文件上传，使用文件的相对路径 (相对于 web 根目录，即 public)
      // 例如 'uploads/products/1678886400000.jpg'
      finalImageUrl = path.join('uploads/products', req.file.filename).replace(/\\/g, '/'); 
      console.log(`Uploaded image file detected: /${finalImageUrl}`); // 前面加 / 表示根路径
    } else if (bodyImageUrl) {
      // 如果没有文件上传，但提供了 URL，则使用 URL
      finalImageUrl = bodyImageUrl;
      console.log(`Using provided image URL: ${finalImageUrl}`);
    } else {
       console.log(`No image uploaded or URL provided, using default image.`);
    }

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
            name, description, price, imageUrl: bodyImageUrl, origin // 使用 bodyImageUrl 回填
        });
    }

    // 基本验证
     if (!name || !price) {
         return res.status(400).render('products/new', {
            title: '发布新商品 - VeriTrade Chain',
            user: req.session.user,
            error: '商品名称和价格不能为空',
             name, description, price, imageUrl: bodyImageUrl, origin // 使用 bodyImageUrl 回填
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
      imageUrl: finalImageUrl, // <- 使用处理后的图片 URL 或路径
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

      // --- 步骤 2: 商品创建成功后，记录初始溯源事件 --- 
      try {
          console.log(`[Product Create] Recording initial traceability event for product ${blockchainProductId}`);
          const traceTxId = await blockchainService.submitTransaction(
              userId,       // 卖家 ID
              password,     // !! 同样需要密码签名 !!
              'traceability', // 链码名称
              'RecordEvent', // 函数名称
              blockchainProductId, // 参数1: 链上商品 ID
              'PRODUCT_CREATED',  // 参数2: 事件类型
              { name: newProduct.name, origin: newProduct.origin } // 参数3: 事件数据 (可选)
          );
          console.log(`[Product Create] Initial traceability event recorded. TX ID: ${traceTxId}`);
      } catch (traceError) {
          // 溯源事件记录失败，通常不应阻塞商品创建，但需要记录日志
          console.error(`[Product Create] WARNING: Failed to record initial traceability event for product ${blockchainProductId} after creation:`, traceError);
          // 可以考虑添加一个标记到本地商品数据，表示溯源初始化失败
      }
      // --------------------------------------------

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
        name, description, price, imageUrl: bodyImageUrl, origin // 回填表单数据
      });
    }
    // ----------------------------

  } catch (error) {
    // 捕获其他意外错误
    console.error('创建产品控制器时发生意外错误:', error);
    res.status(500).render('products/new', {
      title: '发布新商品 - VeriTrade Chain',
      user: req.session.user,
      error: `创建产品时发生内部错误: ${error.message || '请重试'}`, 
      name, description, price, imageUrl: bodyImageUrl, origin // 回填表单数据
    });
  }
};

// 获取产品详情 (更新：传递卖家信誉)
exports.getProductDetail = async (req, res) => { // 改为 async 函数
  const productId = req.params.id;
  const product = global.products.find(p => p.id === productId);
  
  if (!product) {
    return res.status(404).render('error', {
      message: '找不到商品',
      error: { status: 404, stack: '请求的商品不存在' }
    });
  }
  
  // 找到卖家信息
  const seller = global.users.find(u => u.id === product.sellerId);
  let sellerReputation = { reviews: [], score: 0, count: 0 }; // 默认值

  // 如果找到了卖家，尝试获取其信誉信息
  if (seller && seller.id) {
    try {
      console.log(`[Product Detail] Fetching reputation for seller ${seller.id}`);
      const reputationData = await blockchainService.query('reputation', seller.id);
      if (reputationData) {
        sellerReputation = reputationData; // 使用从链上查询到的数据
      }
    } catch (error) {
      console.error(`[Product Detail] Failed to fetch reputation for seller ${seller.id}:`, error);
      // 获取失败，继续使用默认值，页面会显示加载失败
    }
  }
  
  res.render('products/show', {
    title: `${product.name} - VeriTrade Chain`,
    product,
    seller: seller ? { id: seller.id, name: seller.name, publicKey: seller.publicKey } : { name: '未知卖家' }, 
    sellerReputation: sellerReputation, // <-- 传递信誉数据给视图
    user: req.session.user
  });
}; 