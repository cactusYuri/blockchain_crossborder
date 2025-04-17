const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verify } = require('../utils/cryptoUtils'); // 引入验证函数

// 引入新的模拟器实例
const traceabilitySimulator = require('../chaincode/traceability/traceabilitySimulator');
const reputationSimulator = require('../chaincode/reputation/reputationSimulator');
const disputeResolutionSimulator = require('../chaincode/dispute_resolution/disputeResolutionSimulator');
// 引入 Token 模拟器以处理争议解决后的资金流转
const tokenSimulator = require('../simulators/tokenSimulator');

class Transaction {
  constructor(from, chaincodeName, functionName, originalArgs, timestamp, signature, signedData) {
    this.from = from; // 交易发起者的公钥 (PEM format)
    this.chaincodeName = chaincodeName;
    this.functionName = functionName;
    this.originalArgs = originalArgs; // 未签名的原始参数
    this.timestamp = timestamp || Date.now();
    this.signature = signature; // 交易签名 (base64)
    this.signedData = signedData; // 被签名的数据 (string)
    // 交易 ID 可以基于时间戳或其他唯一标识符，不再基于内容哈希
    this.id = `tx_${this.timestamp}_${crypto.randomBytes(4).toString('hex')}`;
  }

  isValid() {
    if (!this.from || !this.signature || !this.signedData) {
      console.error('[Validation] Transaction is missing public key, signature, or signed data.', { from: !!this.from, sig: !!this.signature, data: !!this.signedData });
      return false;
    }

    try {
        const isValid = verify(this.signedData, this.signature, this.from);
        if (!isValid) {
            console.error(`[Validation] Signature verification failed for ${this.chaincodeName}.${this.functionName}.`);
        }
        return isValid;
    } catch (error) {
        console.error('[Validation] Error during signature verification:', error);
        return false;
    }
  }
}

class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.timestamp = timestamp;
    this.transactions = transactions.map(txData => {
        if (!txData || typeof txData !== 'object') return null;
        return new Transaction(
            txData.from,
            txData.chaincodeName,
            txData.functionName,
            txData.originalArgs,
            txData.timestamp,
            txData.signature,
            txData.signedData
        );
    }).filter(tx => tx !== null);
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
      const txDataForHash = this.transactions.map(tx => ({ 
          from: tx.from, 
          chaincodeName: tx.chaincodeName, 
          functionName: tx.functionName, 
          originalArgs: tx.originalArgs,
          timestamp: tx.timestamp, 
          signature: tx.signature,
          signedData: tx.signedData,
          id: tx.id
      }));
    return crypto.createHash('sha256').update(
      this.previousHash +
      this.timestamp +
      JSON.stringify(txDataForHash) +
      this.nonce
    ).digest('hex');
  }

  mineBlock(difficulty) {
    const target = Array(difficulty + 1).join('0');
    console.log(`[Mining] Starting to mine block... Difficulty: ${difficulty}`);
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
    console.log(`[Mining] Block Mined! Hash: ${this.hash}, Nonce: ${this.nonce}`);
    return this.hash;
  }

  hasValidTransactions() {
    for (const tx of this.transactions) {
      if (!(tx instanceof Transaction)) {
          console.error('[Validation] Item in block transactions is not a Transaction object:', tx);
          return false; 
      }
      if (!tx.isValid()) {
        return false;
      }
    }
    return true;
  }
}

class Blockchain {
  constructor() {
    this.chain = [];
    this.difficulty = 2;
    this.pendingTransactions = [];
    // 不再需要在 worldState 中存储这些数据，因为它们由各自的模拟器管理
    this.worldState = {
      // traceability: {},
      // reputation: {},
      // products: {},
      orders: {} // 暂时保留 orders，因为它还在被 processTransaction 直接修改
    };
    this.dataDir = path.join(__dirname, '../data/blockchain');
    this.chainFile = path.join(this.dataDir, 'chain.json');
    this.stateFile = path.join(this.dataDir, 'worldState.json'); // 这个文件现在可能只包含 orders
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.loadFromDisk();
    if (this.chain.length === 0) {
        this.chain.push(this.createGenesisBlock());
        this.saveToDisk(); // 保存包含 Genesis 的链
    }
  }

  createGenesisBlock() {
    console.log('[Blockchain] Creating Genesis Block...');
    const genesisBlock = new Block(Date.parse('2024-01-01'), [], '0'); 
    return genesisBlock;
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addTransaction(transaction) {
    if (!transaction || !(transaction instanceof Transaction) || !transaction.from || !transaction.signature || !transaction.signedData) {
        console.error('[Pending TX] Invalid transaction object provided:', transaction);
        throw new Error('Invalid transaction object provided.');
    }
    
    if (!transaction.isValid()) {
      throw new Error('Invalid transaction signature.');
    }

    this.pendingTransactions.push(transaction);
    console.log(`[Pending TX] Transaction ${transaction.id} added for ${transaction.chaincodeName}.${transaction.functionName}`);

    if (this.pendingTransactions.length >= 1) {
      console.log('[Pending TX] Threshold reached, initiating mining...');
      this.minePendingTransactions('simulated-miner-address');
    }

    return transaction.id;
  }

  minePendingTransactions(minerAddress) {
    if (this.pendingTransactions.length === 0) {
        console.log('[Mining] No pending transactions to mine.');
        return;
    }

    console.log(`[Mining] Mining ${this.pendingTransactions.length} pending transactions...`);
    const block = new Block(Date.now(), this.pendingTransactions, this.getLatestBlock().hash);
    
    block.mineBlock(this.difficulty);

    console.log('[Mining] Block successfully mined!');
    this.chain.push(block);

    this.applyTransactions(block);

    this.pendingTransactions = [];

    this.saveToDisk();
  }

  applyTransactions(block) {
    for (const transaction of block.transactions) {
        this.processTransaction(transaction);
    }
  }

  processTransaction(transaction) {
    const { chaincodeName, functionName, originalArgs, from, signature, timestamp, id } = transaction;
    const transactionDetails = { txId: id, timestamp, actorPublicKey: from, signature }; // 传递给模拟器

    console.log(`[Processing TX ${id}] ${chaincodeName}.${functionName}`);

    try {
      if (chaincodeName === 'traceability') {
          if (functionName === 'RecordEvent') {
              const [productId, eventType, eventData] = originalArgs;
              traceabilitySimulator.recordEvent(productId, eventType, eventData, transactionDetails);
          } else {
              console.warn(` -> Unknown function in traceability: ${functionName}`);
          }
      } else if (chaincodeName === 'reputation') {
          if (functionName === 'SubmitReview') { // 函数名改为 SubmitReview
              const [orderId, sellerId, rating, commentHash] = originalArgs;
              reputationSimulator.submitReview(orderId, sellerId, rating, commentHash, transactionDetails);
          } else {
              console.warn(` -> Unknown function in reputation: ${functionName}`);
          }
      } else if (chaincodeName === 'product') {
          if (functionName === 'CreateProduct') {
              const [productId, name, price, description, origin] = originalArgs;
              if (!this.worldState.products) this.worldState.products = {};
              if (!this.worldState.products[from]) this.worldState.products[from] = [];
              const newProduct = { txId: id, productId, name, price, description, origin, ownerPublicKey: from, timestamp, signature };
              this.worldState.products[from].push(newProduct);
              console.log(` -> Product ${name} (ID: ${productId}) created by ${from.substring(0,20)}...`);
          }
      } else if (chaincodeName === 'order') {
          if (functionName === 'CreateOrder') {
              const [orderId, productId, quantity, sellerPublicKey] = originalArgs;
              if (!this.worldState.orders) this.worldState.orders = {};
              const newOrder = { txId: id, orderId, productId, quantity, buyerPublicKey: from, sellerPublicKey, status: 'PENDING', timestamp, signature };
              this.worldState.orders[orderId] = newOrder;
              console.log(` -> Order ${orderId} for product ${productId} created by buyer ${from.substring(0,20)}...`);
          } else if (functionName === 'ConfirmShipment') {
              const [orderId, trackingNumber] = originalArgs;
              if (this.worldState.orders && this.worldState.orders[orderId]) {
                  const order = this.worldState.orders[orderId];
                  if (order.status === 'PENDING') {
                      order.status = 'SHIPPED';
                      order.trackingNumber = trackingNumber || 'N/A';
                      order.shippedAt = new Date(timestamp).toISOString();
                      console.log(` -> Order ${orderId} status updated to SHIPPED.`);
                  } else { console.warn(` -> Order ${orderId} cannot be shipped. Status: ${order.status}`); }
              } else { console.error(` -> Order ${orderId} not found for ConfirmShipment.`); }
          } else if (functionName === 'ConfirmDelivery') {
              const [orderId] = originalArgs;
              if (this.worldState.orders && this.worldState.orders[orderId]) {
                  const order = this.worldState.orders[orderId];
                  if (order.status === 'SHIPPED') {
                      order.status = 'DELIVERED';
                      order.deliveredAt = new Date(timestamp).toISOString();
                      console.log(` -> Order ${orderId} status updated to DELIVERED.`);
                  } else { console.warn(` -> Order ${orderId} cannot be delivered. Status: ${order.status}`); }
              } else { console.error(` -> Order ${orderId} not found for ConfirmDelivery.`); }
          }
      } else if (chaincodeName === 'dispute_resolution') {
          if (functionName === 'OpenDispute') {
              const [orderId, reason, defendantId] = originalArgs;
              disputeResolutionSimulator.openDispute(orderId, reason, defendantId, transactionDetails);
          } else if (functionName === 'SubmitEvidence') {
              const [disputeId, dataHash] = originalArgs;
              disputeResolutionSimulator.submitEvidence(disputeId, dataHash, transactionDetails);
          } else if (functionName === 'ResolveDispute') {
              const [disputeId, decision] = originalArgs;
              const resolved = disputeResolutionSimulator.resolveDispute(disputeId, decision, transactionDetails);
              if (resolved) {
                  // 争议解决后，尝试处理资金流转
                  const dispute = disputeResolutionSimulator.getDispute(disputeId);
                  if (dispute && dispute.orderId) {
                      console.log(`[Processing TX ${id}] Dispute ${disputeId} resolved. Checking decision for token action: ${decision}`);
                      // 简化处理：根据 decision 关键词决定是退款给买家还是释放给卖家
                      const decisionLower = decision.toLowerCase();
                      if (decisionLower.includes('refund') && decisionLower.includes('buyer')) {
                          try {
                              tokenSimulator.refundEscrowToBuyer(dispute.orderId);
                              console.log(` -> Token refunded to buyer for order ${dispute.orderId} based on dispute resolution.`);
                          } catch (tokenError) {
                              console.error(` -> FAILED to refund token for order ${dispute.orderId} after dispute resolution:`, tokenError);
                          }
                      } else if (decisionLower.includes('release') && decisionLower.includes('seller')) {
                          try {
                              tokenSimulator.releaseFromEscrow(dispute.orderId);
                              console.log(` -> Token released to seller for order ${dispute.orderId} based on dispute resolution.`);
                          } catch (tokenError) {
                              console.error(` -> FAILED to release token for order ${dispute.orderId} after dispute resolution:`, tokenError);
                          }
                      } else {
                           console.log(` -> No specific token action triggered by dispute decision: "${decision}"`);
                      }
                  }
              }
          } else {
               console.warn(` -> Unknown function in dispute_resolution: ${functionName}`);
          }
      } else {
          console.warn(`[Processing TX ${id}] Unknown chaincode: ${chaincodeName}`);
      }
      // 成功处理后，保存 worldState (如果它被修改了，比如 orders)
      this.saveWorldState(); // 新增一个只保存 worldState 的方法
    } catch (error) {
       console.error(`[Processing TX ${id}] Error processing ${chaincodeName}.${functionName}:`, error);
       // 在模拟环境中，我们通常不停止整个链的处理，只是记录错误
       // 真实链码中，错误处理会更复杂，可能导致交易失败
    }
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
        const currentBlock = this.chain[i];
        const previousBlock = this.chain[i - 1];

        if (currentBlock.hash !== currentBlock.calculateHash()) {
            console.error(`[Chain Validation] Invalid block hash for block ${i}.`);
            return false;
        }

        if (currentBlock.previousHash !== previousBlock.hash) {
            console.error(`[Chain Validation] Previous hash mismatch for block ${i}.`);
            return false;
        }
        
        if (!currentBlock.hasValidTransactions()) {
            console.error(`[Chain Validation] Block ${i} contains invalid transactions.`);
            return false;
        }
    }
    return true;
  }

  queryWorldState(chaincodeName, key, subkey = null) {
    console.log(`[Query] Querying world state for ${chaincodeName}, key: ${key}, subkey: ${subkey}`);
    try {
        if (chaincodeName === 'traceability') {
            // 假设 key 是 productId
            return traceabilitySimulator.getTraceability(key);
        } else if (chaincodeName === 'reputation') {
            // 假设 key 是 sellerId, subkey 可以是 'reviews' 或 'score' (虽然模拟器现在返回整个对象)
            if (subkey === 'reviews') {
                 return reputationSimulator.getSellerReviews(key);
            } else {
                 // 返回包含 score, count, reviews 的整个对象
                 return reputationSimulator.getSellerReputation(key);
            }
        } else if (chaincodeName === 'dispute_resolution') {
             // 假设 key 是查询类型 ('id' 或 'orderId'), subkey 是对应的 ID
             if (key === 'id') {
                 return disputeResolutionSimulator.getDispute(subkey);
             } else if (key === 'orderId') {
                 return disputeResolutionSimulator.getDisputesByOrder(subkey);
             }
        } else if (chaincodeName === 'product' && key === 'owner') {
            // 保持 product 查询逻辑 (使用 worldState)
            return this.worldState.products ? (this.worldState.products[subkey] || []) : [];
        } else if (chaincodeName === 'order') {
            // 保持 order 查询逻辑 (使用 worldState)
             if (key === 'id') {
                return this.worldState.orders ? this.worldState.orders[subkey] : null;
            } else if (key === 'buyer' || key === 'seller') {
                const publicKeyField = key === 'buyer' ? 'buyerPublicKey' : 'sellerPublicKey';
                const userOrders = [];
                if (this.worldState.orders) {
                    for (const orderId in this.worldState.orders) {
                        if (this.worldState.orders[orderId][publicKeyField] === subkey) {
                            userOrders.push(this.worldState.orders[orderId]);
                        }
                    }
                }
                return userOrders;
            } 
        }
        console.warn(`[Query] Unknown query type or combination: ${chaincodeName}/${key}/${subkey}`);
        return null;
    } catch (error) {
        console.error(`[Query] Error during query ${chaincodeName}/${key}/${subkey}:`, error);
        return null;
    }
  }

  // 只保存 World State 文件
  saveWorldState() {
      try {
         fs.writeFileSync(this.stateFile, JSON.stringify(this.worldState, null, 2));
         // console.log('[Persistence] World state saved to disk.'); // 减少日志噪音
      } catch (error) {
         console.error('[Persistence] Error saving world state data:', error);
      }
  }

  saveToDisk() {
    try {
      fs.writeFileSync(this.chainFile, JSON.stringify(this.chain, null, 2));
      this.saveWorldState(); // 调用保存 world state 的方法
      console.log('[Persistence] Blockchain data (chain & state) saved to disk.');
    } catch (error) {
      console.error('[Persistence] Error saving blockchain data:', error);
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.chainFile)) {
        const chainData = JSON.parse(fs.readFileSync(this.chainFile, 'utf8'));
        this.chain = chainData.map(blockData => {
            return new Block(blockData.timestamp, blockData.transactions, blockData.previousHash);
        });
        console.log(`[Persistence] Chain loaded from ${this.chainFile}. Length: ${this.chain.length}`);
      } else {
          this.chain = [];
      }
      
      // 加载 worldState (现在主要包含 orders)
      if (fs.existsSync(this.stateFile)) {
        this.worldState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        console.log(`[Persistence] World state (orders, products) loaded from ${this.stateFile}.`);
        // 其他数据由各自模拟器的构造函数加载
        // this.worldState.traceability = ...; // 移除
        // this.worldState.reputation = ...; // 移除
        this.worldState.products = this.worldState.products || {}; // 保留
        this.worldState.orders = this.worldState.orders || {}; // 保留
      } else {
          this.worldState = { products: {}, orders: {} };
      }

      if (this.chain.length > 1 && !this.isChainValid()) {
        console.error("[Persistence] Loaded chain is invalid! Resetting to genesis block.");
        this.chain = [this.createGenesisBlock()];
        this.worldState = { products: {}, orders: {} };
        this.saveToDisk();
      } else if (this.chain.length > 0) {
          console.log("[Persistence] Loaded chain is valid.");
      }

    } catch (error) {
      console.error('[Persistence] Error loading blockchain data:', error);
      this.chain = this.chain || [];
      if (this.chain.length === 0) this.chain.push(this.createGenesisBlock());
      this.worldState = { products: {}, orders: {} };
    }
  }
}

const { decrypt } = require('../utils/cryptoUtils');
const { sign } = require('../utils/cryptoUtils');

function findUserById(userId) {
    if (!global.users) {
        console.error("findUserById: global.users not loaded!");
        try {
            const usersFilePath = path.join(__dirname, '../data', 'users.json');
            if (fs.existsSync(usersFilePath)) {
                global.users = JSON.parse(fs.readFileSync(usersFilePath, 'utf-8'));
            } else {
                global.users = [];
            }
        } catch (err) {
            console.error("Error loading users.json in findUserById:", err);
            return null;
        }
    }
    return global.users.find(user => user.id === userId);
}

class BlockchainService {
  constructor() {
    this.blockchain = new Blockchain();
  }

  async submitTransaction(userId, userPassword, chaincodeName, functionName, ...args) {
    console.log(`[Service] Attempting submit: User ${userId}, ${chaincodeName}.${functionName}`);
    const user = findUserById(userId);
    if (!user) {
      throw new Error('User not found for transaction submission.');
    }
    if (!user.publicKey || !user.encryptedPrivateKey) {
      throw new Error('User key information is missing.');
    }

    let privateKey;
    try {
      privateKey = decrypt(user.encryptedPrivateKey, userPassword);
    } catch (error) {
      console.error(`[Service] Failed to decrypt private key for user ${userId}:`, error.message);
      throw new Error('Failed to decrypt private key. Incorrect password?');
    }

    const timestamp = Date.now();
    const dataToSign = JSON.stringify({ 
        chaincode: chaincodeName, 
        func: functionName, 
        args: args,
        timestamp: timestamp 
    });

    const signature = sign(dataToSign, privateKey);

    const transaction = new Transaction(
      user.publicKey,
      chaincodeName,
      functionName,
      args,
      timestamp,
      signature,
      dataToSign
    );

    try {
      const txId = this.blockchain.addTransaction(transaction);
      console.log(`[Service] Transaction ${txId} submitted successfully.`);
      return txId;
    } catch (error) {
      console.error(`[Service] Failed to add transaction to blockchain:`, error);
      throw new Error(`Transaction rejected: ${error.message}`); 
    }
  }

  async query(chaincodeName, key, subkey = null) {
    return this.blockchain.queryWorldState(chaincodeName, key, subkey);
  }
  
  getChain() {
      return this.blockchain.chain;
  }

  getWorldState() {
      return this.blockchain.worldState;
  }
  
}

module.exports = new BlockchainService(); 