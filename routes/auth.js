const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// 注册页面
router.get('/register', authController.getRegister);

// 处理注册请求
router.post('/register', authController.postRegister);

// 登录页面
router.get('/login', authController.getLogin);

// 处理登录请求
router.post('/login', authController.postLogin);

// 退出登录
router.get('/logout', authController.logout);

// --- 用户个人资料页面 --- 
router.get('/profile', isAuthenticated, authController.getProfile);

module.exports = router; 