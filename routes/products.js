const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// 获取所有产品列表
router.get('/', productController.getAllProducts);

// 显示创建产品表单（只需要登录）
router.get('/new', isAuthenticated, productController.getNewProductForm);

// 处理创建产品请求（只需要登录）
router.post('/', isAuthenticated, productController.createProduct);

// 获取单个产品详情
router.get('/:id', productController.getProductDetail);

module.exports = router; 