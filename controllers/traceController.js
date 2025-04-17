const fabricService = require('../services/blockchainService');

// 获取产品溯源历史
exports.getProductTraceHistory = async (req, res) => {
  const blockchainProductId = req.params.blockchainProductId;
  
  try {
    // 从区块链获取溯源历史
    const historyData = await fabricService.evaluateTransaction(
      'traceability',
      'GetHistoryForProduct',
      blockchainProductId
    );
    
    let history = [];
    try {
      // 解析历史数据
      history = JSON.parse(historyData);
      // 按时间戳排序（从新到旧）
      history.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
    } catch (error) {
      console.error('解析溯源历史数据失败:', error);
      history = [];
    }
    
    // 查找对应的产品信息
    const product = global.products.find(p => p.blockchainProductId === blockchainProductId);
    
    res.render('trace/history', {
      title: '商品溯源 - VeriTrade Chain',
      blockchainProductId,
      history,
      product,
      user: req.session.user
    });
  } catch (error) {
    console.error('获取溯源历史出错:', error);
    
    // 即使区块链查询失败，也尝试显示产品信息
    const product = global.products.find(p => p.blockchainProductId === blockchainProductId);
    
    res.render('trace/history', {
      title: '商品溯源 - VeriTrade Chain',
      blockchainProductId,
      history: [],
      product,
      error: '获取溯源历史数据失败，请稍后重试',
      user: req.session.user
    });
  }
}; 