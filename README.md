# VeriTrade Chain - 区块链跨境电商平台

VeriTrade Chain是一个基于区块链技术的跨境电商平台，使用Hyperledger Fabric区块链技术实现商品溯源和卖家信誉系统，提供更加透明和可信的电商体验。

## 主要功能

- **用户管理**：支持买家和卖家注册登录
- **商品管理**：卖家可以发布商品，每个商品有唯一的区块链ID
- **商品溯源**：通过扫描商品二维码，查看完整的商品生命周期记录
- **订单系统**：支持下单、发货等基本电商功能
- **区块链评价**：基于区块链的评价系统，确保评价内容不可篡改
- **卖家信誉**：基于区块链评价的卖家信誉评分系统

## 技术栈

- **后端**：Node.js + Express.js
- **前端模板引擎**：EJS
- **数据存储**：内存存储（非持久化）
- **区块链**：Hyperledger Fabric (模拟，为演示目的)
- **其他库**：
  - bcrypt (密码哈希)
  - express-session (会话管理)
  - uuid (生成唯一ID)
  - qrcode (生成二维码)
  - crypto (哈希计算)

## 重要说明

**注意：此应用为演示版本，使用内存存储，所有数据（用户、商品、订单等）在应用重启后将会丢失！只有区块链数据会被模拟保存。**

## 项目结构

```
/veritrade-chain-mem
├── config/             # Fabric连接配置
├── controllers/        # 请求处理逻辑
├── data/               # 内存数据存储
├── public/             # 静态资源
│   ├── css/            # CSS样式
│   └── js/             # 客户端脚本
├── routes/             # Express路由
├── services/           # 业务逻辑，包括Fabric交互
├── views/              # EJS模板
│   ├── partials/       # 共用模板部分
│   ├── auth/           # 认证相关页面
│   ├── products/       # 产品相关页面
│   ├── orders/         # 订单相关页面
│   └── trace/          # 溯源相关页面
├── chaincode/          # 链码源码（演示用）
│   ├── traceability/   # 溯源链码
│   └── reputation/     # 信誉链码
├── scripts/            # 辅助脚本
├── app.js              # 主应用入口
├── package.json        # 依赖配置
└── README.md           # 说明文档
```

## 快速开始

### 安装与运行

1. 确保安装了Node.js (建议v14或更高版本)
2. 克隆项目并安装依赖：
   ```
   git clone <项目地址>
   cd veritrade-chain-mem
   npm install
   ```
3. 启动应用：
   ```
   npm start
   ```
   或开发模式：
   ```
   npm run dev
   ```
4. 访问 `http://localhost:3000`

### 测试账户

应用启动时会自动创建以下测试账户：

- **管理员**：admin@example.com / admin123
- **卖家**：seller@example.com / seller123
- **买家**：buyer@example.com / buyer123

## 功能演示

1. **登录测试卖家账户**：使用seller@example.com / seller123登录
2. **发布商品**：添加商品信息，系统会自动生成区块链ID并记录创建事件
3. **登录测试买家账户**：使用buyer@example.com / buyer123登录
4. **购买商品**：浏览商品列表，选择商品并下单
5. **卖家发货**：卖家登录后在订单详情页点击"确认发货"，系统会记录发货事件到区块链
6. **查看溯源信息**：访问商品详情页，扫描二维码或点击"直接查看溯源信息"链接
7. **买家评价**：买家登录后在订单详情页提交评价，系统会记录评价到区块链

## 区块链模拟说明

本演示版本使用内存数据结构模拟区块链存储，实际生产环境中应连接到真实的Hyperledger Fabric网络。完整实现请参考Hyperledger Fabric文档和SDK。 