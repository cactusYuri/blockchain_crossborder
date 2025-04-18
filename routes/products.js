const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// 引入 multer 和 path 用于文件上传
const multer = require('multer');
const path = require('path');

// --- Multer 配置 --- 
// (与 Controller 中的配置保持一致或进行优化)
const uploadDir = 'public/uploads/products/';
// 确保目录存在 (路由文件加载时检查一次即可)
const fs = require('fs');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // 保持与控制器一致的文件名生成方式
    cb(null, Date.now() + '-' + path.extname(file.originalname));
  }
});

const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        // 这里可以传递一个错误给 multer 的错误处理机制
        cb(new Error('只允许上传图片文件!'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 可选：限制文件大小为 5MB
}).single('imageFile'); // 对应表单中的 name='imageFile'
// --- 结束 Multer 配置 ---


// 获取所有产品列表
router.get('/', productController.getAllProducts);

// 显示创建产品表单（只需要登录）
router.get('/new', isAuthenticated, productController.getNewProductForm);

// 处理创建产品请求（只需要登录）
router.post('/', isAuthenticated, (req, res, next) => { // 添加 multer 中间件
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // Multer 自身的错误 (例如文件过大)
            console.error('Multer error:', err);
            // 可以将错误信息传递给视图
            return res.status(400).render('products/new', {
                title: '发布新商品 - VeriTrade Chain',
                user: req.session.user,
                error: `图片上传错误: ${err.message}`,
                ...req.body // 回填其他表单字段
            });
        } else if (err) {
            // 文件过滤器返回的错误或其他意外错误
            console.error('File upload error:', err);
            return res.status(400).render('products/new', {
                title: '发布新商品 - VeriTrade Chain',
                user: req.session.user,
                error: err.message || '图片上传失败' ,
                ...req.body
            });
        }
        // 没有错误，或者文件是可选的且未上传，继续执行控制器逻辑
        next();
    });
}, productController.createProduct);

// 获取单个产品详情
router.get('/:id', productController.getProductDetail);

module.exports = router; 