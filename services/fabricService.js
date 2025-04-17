/**
 * Fabric服务 - 与Hyperledger Fabric网络交互
 * 
 * 注意：这是一个模拟服务，用于演示。在实际应用中，需要连接到真实的Fabric网络。
 * 对于真实应用，请参考：https://hyperledger.github.io/fabric-sdk-node/
 */

// 内存数据存储，模拟区块链交易
const mockTraceabilityLedger = {};
const mockReputationLedger = {};

// 模拟合约调用次数，用于生成唯一交易ID
let txCount = 0;

/**
 * 提交交易（写入区块链）
 */
exports.submitTransaction = async (chaincodeName, functionName, ...args) => {
  // 生成模拟交易ID
  const txId = `tx_${Date.now()}_${txCount++}`;
  console.log(`[Fabric模拟] 提交交易 - ${chaincodeName}.${functionName}:`, args);
  
  try {
    // 根据链码类型和函数选择不同的处理逻辑
    if (chaincodeName === 'traceability') {
      // 溯源链码
      if (functionName === 'RecordEvent') {
        const [productId, eventType, eventData, timestamp] = args;
        // 如果商品不存在，初始化历史记录数组
        if (!mockTraceabilityLedger[productId]) {
          mockTraceabilityLedger[productId] = [];
        }
        
        // 添加新事件
        mockTraceabilityLedger[productId].push({
          txId,
          eventType,
          eventData,
          timestamp
        });
        
        console.log(`[Fabric模拟] 产品 ${productId} 添加事件: ${eventType}`);
      } else {
        throw new Error(`未实现的函数: ${functionName}`);
      }
    } else if (chaincodeName === 'reputation') {
      // 信誉链码
      if (functionName === 'AddReviewRecord') {
        const [reviewId, orderId, sellerId, buyerId, rating, commentHash, timestamp] = args;
        
        // 如果卖家不存在，初始化评价数组
        if (!mockReputationLedger[sellerId]) {
          mockReputationLedger[sellerId] = [];
        }
        
        // 添加新评价
        mockReputationLedger[sellerId].push({
          txId,
          reviewId,
          orderId,
          buyerId,
          rating,
          commentHash,
          timestamp
        });
        
        console.log(`[Fabric模拟] 卖家 ${sellerId} 添加评价: ${rating}星`);
      } else {
        throw new Error(`未实现的函数: ${functionName}`);
      }
    } else {
      throw new Error(`未知的链码: ${chaincodeName}`);
    }
    
    // 模拟交易成功
    return txId;
  } catch (error) {
    console.error(`[Fabric模拟] 交易失败:`, error);
    throw error;
  }
};

/**
 * 查询交易（读取区块链）
 */
exports.evaluateTransaction = async (chaincodeName, functionName, ...args) => {
  console.log(`[Fabric模拟] 查询 - ${chaincodeName}.${functionName}:`, args);
  
  try {
    // 根据链码类型和函数选择不同的处理逻辑
    if (chaincodeName === 'traceability') {
      // 溯源链码
      if (functionName === 'GetHistoryForProduct') {
        const [productId] = args;
        // 返回商品的历史记录
        const history = mockTraceabilityLedger[productId] || [];
        return JSON.stringify(history);
      } else {
        throw new Error(`未实现的函数: ${functionName}`);
      }
    } else if (chaincodeName === 'reputation') {
      // 信誉链码
      if (functionName === 'GetSellerReviews') {
        const [sellerId] = args;
        // 返回卖家的评价记录
        const reviews = mockReputationLedger[sellerId] || [];
        return JSON.stringify(reviews);
      } else {
        throw new Error(`未实现的函数: ${functionName}`);
      }
    } else {
      throw new Error(`未知的链码: ${chaincodeName}`);
    }
  } catch (error) {
    console.error(`[Fabric模拟] 查询失败:`, error);
    throw error;
  }
}; 