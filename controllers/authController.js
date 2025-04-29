const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { generateKeyPair, encrypt } = require('../utils/cryptoUtils');
const { saveData } = require('../utils/dataPersistence'); // 引入 saveData
const tokenSimulator = require('../simulators/tokenSimulator'); // <--- 添加这行

// --- 定义用户文件路径 (不再需要) ---
// const dataDir = path.join(__dirname, '../data');
// const usersFilePath = path.join(dataDir, 'users.json');

// --- Helper function to save users (移除) ---
// function saveUsersToFile() { ... }

// 显示注册页面
exports.getRegister = (req, res) => {
  res.render('auth/register', { 
    title: '注册 - VeriTrade Chain',
    error: null,
    user: req.session.user
  });
};

// 处理注册请求
exports.postRegister = (req, res) => {
  const { email, password, name } = req.body;
  
  // 检查邮箱是否已存在
  if (!global.users) {
      console.error('[Auth Register] global.users is not initialized!');
      return res.status(500).send('Server error: User data not available.'); 
  }
  const existingUser = global.users.find(user => user.email === email);
  if (existingUser) {
    return res.render('auth/register', { 
      title: '注册 - VeriTrade Chain',
      error: '该邮箱已被注册',
      user: req.session.user
    });
  }
  
  // 生成密钥对并加密私钥
  try {
    const { publicKey, privateKey } = generateKeyPair();
    const encryptedPrivateKey = encrypt(privateKey, password);

    // 创建新用户
    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser = {
        id: uuidv4(),
        email,
        passwordHash,
        name,
        role: 'user',
        publicKey: publicKey,
        encryptedPrivateKey: encryptedPrivateKey
    };
  
    // 添加到内存数组
    global.users.push(newUser);
  
    // --- 使用 saveData 保存用户数据 ---
    saveData('users', global.users); 
    // -------------------------------

    // --- 初始化用户的 DEMO Token 余额 ---
    try {
        tokenSimulator.mintTokens(newUser.id, newUser.balance); // <--- 添加这行，使用 newUser.balance (即 10000)
        console.log(`[Auth Register] Initialized DEMO token balance for user ${newUser.id}`);
    } catch (tokenError) {
        // 如果 token 初始化失败，这是一个严重问题，需要记录
        console.error(`[Auth Register] CRITICAL: Failed to initialize token balance for new user ${newUser.id}.`, tokenError);
        // 可以考虑是否要回滚用户创建，或者至少通知管理员
        // 目前为了简单起见，只记录错误，注册流程继续
    }
    // ------------------------------------

    // 注册成功后自动登录
    const initialBalance = tokenSimulator.getBalance(newUser.id); // <--- 获取初始余额
    req.session.user = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        publicKey: newUser.publicKey,
        balance: initialBalance // <--- 使用 simulator 的余额
    };
  
    console.log('New user registered and saved:', { id: newUser.id, email: newUser.email, role: newUser.role, balance: initialBalance }); // 日志也用新余额

    res.redirect('/');

  } catch (error) {
    console.error("[Auth Register] Error during registration process:", error);
    res.render('auth/register', { 
        title: '注册 - VeriTrade Chain',
        error: '注册过程中发生内部错误，请稍后重试。',
        user: req.session.user
    });
  }
};

// 显示登录页面
exports.getLogin = (req, res) => {
  res.render('auth/login', { 
    title: '登录 - VeriTrade Chain',
    error: null,
    user: req.session.user
  });
};

// 处理登录请求
exports.postLogin = (req, res) => {
  const { email, password } = req.body;
  
  if (!global.users) {
      console.error('[Auth Login] global.users is not initialized!');
      return res.status(500).send('Server error: User data not available.'); 
  }
  const user = global.users.find(user => user.email === email);
  if (!user) {
    return res.render('auth/login', { 
      title: '登录 - VeriTrade Chain',
      error: '邮箱或密码不正确',
      user: req.session.user
    });
  }
  
  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    return res.render('auth/login', { 
      title: '登录 - VeriTrade Chain',
      error: '邮箱或密码不正确',
      user: req.session.user
    });
  }
  
  // 登录成功后设置 session (从 simulator 获取 balance)
  const currentBalance = tokenSimulator.getBalance(user.id); // <--- 获取当前真实余额
  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    publicKey: user.publicKey,
    balance: currentBalance // <--- 使用 simulator 的余额
  };

  console.log(`[Auth Login] User ${user.id} logged in. Session balance set to ${currentBalance}`); // 添加登录日志

  res.redirect('/');
};

// 退出登录
exports.logout = (req, res) => {
  req.session.destroy((err) => {
      if (err) {
          console.error("[Auth Logout] Error destroying session:", err);
      }
      res.redirect('/');
  });
};

// --- 显示用户个人资料页面 ---
exports.getProfile = (req, res) => {
    // isAuthenticated 中间件确保 req.session.user 存在
    const userId = req.session.user.id;
    
    // 从 global.users 查找完整的用户信息 (包括加密的私钥和余额)
    const userProfile = global.users.find(u => u.id === userId);

    if (!userProfile) {
        // 如果在 session 中有用户但在 global.users 中找不到 (理论上不应发生)
        console.error(`[Profile] User with ID ${userId} found in session but not in global data.`);
        req.session.destroy(); // 清除无效 session
        return res.redirect('/auth/login');
    }

    // 获取当前真实余额
    const currentProfileBalance = tokenSimulator.getBalance(userId); // <--- 获取当前真实余额

    res.render('profile/show', { // 渲染新的视图文件
        title: '个人资料 - VeriTrade Chain',
        user: req.session.user, // 传递 session user 给 header/footer
        profile: {
            name: userProfile.name,
            email: userProfile.email,
            publicKey: userProfile.publicKey,
            encryptedPrivateKey: userProfile.encryptedPrivateKey,
            balance: currentProfileBalance // <--- 使用 simulator 的余额
            // 不要传递 passwordHash
        }
    });
}; 