const traceabilityService = require('../services/traceabilityService');

// 获取产品溯源历史
exports.getProductTraceHistory = async (req, res) => {
  const blockchainProductId = req.params.blockchainProductId;
  const userId = req.session?.userId || 'admin';
  
  let history = [];
  let errorMsg = null;
  const product = global.products.find(p => p.blockchainProductId === blockchainProductId);

  try {
    console.log(`[Trace Controller] Fetching history for product ${blockchainProductId} using user ${userId}`);
    // 调用新的 traceabilityService 获取历史
    history = await traceabilityService.getProductHistory(userId, blockchainProductId);
    
    // traceabilityService 已经返回了解析好的数组，如果需要排序可以保留
    if (Array.isArray(history)) {
        // 按时间戳排序（从新到旧）- 假设时间戳是 ISO 字符串或可比较的格式
        history.sort((a, b) => (new Date(b.timestamp)) - (new Date(a.timestamp))); 
    } else {
        console.warn('[Trace Controller] getProductHistory did not return an array:', history);
        history = []; // Ensure history is an array
    }

  } catch (error) {
    console.error(`[Trace Controller] 获取溯源历史出错 for product ${blockchainProductId}:`, error);
    errorMsg = `获取溯源历史数据失败: ${error.message}`; // 提供更详细的错误信息
    history = []; // 确保出错时 history 为空数组
  }

  // 渲染视图
  res.render('trace/history', {
    title: '商品溯源 - VeriTrade Chain',
    blockchainProductId,
    history, // 传递从 traceabilityService 获取的数据
    product,
    error: errorMsg, // 传递错误信息
    user: req.session.user
  });
}; 