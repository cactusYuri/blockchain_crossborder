const blockchainService = require('../services/blockchainService');

// 获取区块链状态概览
exports.getBlockchainOverview = (req, res) => {
  const chainHeight = blockchainService.getChainHeight();
  const isValid = blockchainService.isChainValid();
  const latestBlock = blockchainService.getBlock(chainHeight - 1);
  const pendingTransactionsCount = blockchainService.getTransaction('pending')?.length || 0;

  res.render('blockchain/overview', {
    title: '区块链状态 - VeriTrade Chain',
    chainHeight,
    isValid,
    latestBlock,
    pendingTransactionsCount,
    user: req.session.user
  });
};

// 获取所有区块列表
exports.getAllBlocks = (req, res) => {
  const blocks = blockchainService.getAllBlocks();
  
  res.render('blockchain/blocks', {
    title: '区块浏览器 - VeriTrade Chain',
    blocks,
    user: req.session.user
  });
};

// 获取单个区块详情
exports.getBlockDetail = (req, res) => {
  const blockNumber = parseInt(req.params.number);
  const block = blockchainService.getBlock(blockNumber);
  
  if (!block) {
    return res.status(404).render('error', {
      title: '错误 - 未找到资源',
      message: '找不到区块',
      error: { status: 404, stack: '请求的区块不存在' },
      user: req.session.user
    });
  }
  
  res.render('blockchain/block-detail', {
    title: `区块 #${blockNumber} - VeriTrade Chain`,
    block,
    blockNumber,
    user: req.session.user
  });
};

// 获取交易详情
exports.getTransactionDetail = (req, res) => {
  const txId = req.params.id;
  const result = blockchainService.getTransaction(txId);
  const transaction = result ? result.transaction : null;
  const blockHash = result ? result.blockHash : null;
  
  if (!transaction) {
    return res.status(404).render('error', {
      title: '错误 - 未找到资源',
      message: '找不到交易',
      error: { status: 404, stack: '请求的交易不存在' },
      user: req.session.user
    });
  }
  
  res.render('blockchain/transaction-detail', {
    title: `交易 ${txId.substring(0, 8)}... - VeriTrade Chain`,
    transaction,
    blockHash,
    txId,
    user: req.session.user
  });
};

// 手动触发挖矿
exports.minePendingTransactions = (req, res) => {
  const flash = req.flash || ((type, message) => console.log(`[Flash Stub] ${type}: ${message}`));
  
  try {
    const newBlockInfo = blockchainService.minePendingTransactions();
    
    if (newBlockInfo) {
      const newBlockNumber = blockchainService.getChainHeight() - 1;
      flash('success', `成功挖出新区块 #${newBlockNumber}，包含 ${newBlockInfo.txCount} 笔交易。`);
      res.redirect(`/blockchain/blocks/${newBlockNumber}`);
    } else {
      flash('info', '没有待处理的交易需要挖矿');
      res.redirect('/blockchain');
    }
  } catch (error) {
    console.error('手动挖矿失败:', error);
    flash('error', `挖矿过程中出错: ${error.message}`);
    res.redirect('/blockchain');
  }
}; 