const express = require('express');
const session = require('express-session');
const path = require('path');
// const fs = require('fs'); // 不再直接需要 fs
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // crypto 仍然需要用于生成密钥
const { loadData, saveData } = require('./utils/dataPersistence'); // 引入持久化工具
const { generateKeyPair, encrypt } = require('./utils/cryptoUtils'); // 引入加密工具

// 创建Express应用
const app = express();

// 设置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 配置中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 配置session
app.use(session({
  secret: 'veritrade-chain-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1小时
}));

// --- 数据加载 (使用持久化工具) --- 
// const dataDir = path.join(__dirname, 'data'); // 已在工具中处理
// const usersFilePath = path.join(dataDir, 'users.json');
// ... (其他文件路径定义移除)

// 初始化全局数据存储 (使用引入的 loadData)
global.users = loadData('users', []);
global.products = loadData('products', []);
global.orders = loadData('orders', []);
global.reviews = loadData('reviews', []);

// 如果 users 数组为空，创建初始管理员账户 (更新：加密私钥)
if (global.users.length === 0) {
    console.log('No users found, adding default admin user.');
    const adminPassword = 'admin123'; // 初始密码
    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);
    
    try {
        const { publicKey, privateKey } = generateKeyPair(); // 使用 cryptoUtils 生成
        // 加密私钥
        const encryptedPrivateKey = encrypt(privateKey, adminPassword);

        global.users.push({
            id: uuidv4(),
            email: 'admin@example.com',
            passwordHash: adminPasswordHash,
            name: '管理员',
            role: 'admin', // 明确角色
            publicKey: publicKey,
            encryptedPrivateKey: encryptedPrivateKey // 存储加密后的私钥
            // privateKey: privateKey // 不再存储明文私钥
        });
        
        // 将初始管理员用户保存回文件 (使用 saveData)
        saveData('users', global.users);
        console.log('Default admin user created and saved.');

    } catch (error) {
        console.error('Error creating or saving default admin user:', error);
    }
}

// --- 全局用户查找函数 (可选，如果 blockchainService 中已实现) ---
// function findUserById(userId) { ... }
// 如果 blockchainService 中的 findUserById 依赖 global.users，则保留它或确保 global.users 已加载
// 看起来 blockchainService 中的 findUserById 已经尝试加载，可以保持现状

// 导入路由
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const traceRoutes = require('./routes/trace');
const blockchainRoutes = require('./routes/blockchain');

// 使用路由
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/trace', traceRoutes);
app.use('/blockchain', blockchainRoutes);

// 根路由
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'VeriTrade Chain - 区块链跨境电商平台',
    user: req.session.user 
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器正在运行，端口: ${PORT}`);
  // 可以更新测试账户提示，移除买家/卖家区分
  console.log('测试账户:');
  console.log('- 管理员: admin@example.com / admin123');
  // console.log('- 卖家: seller@example.com / seller123');
  // console.log('- 买家: buyer@example.com / buyer123');
  console.log('(现在普通用户角色统一，注册即可)');
}); 