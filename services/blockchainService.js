const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verify } = require('../utils/cryptoUtils'); // 引入验证函数

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
    this.worldState = {
      traceability: {},
      reputation: {}
    };
    this.dataDir = path.join(__dirname, '../data/blockchain');
    this.chainFile = path.join(this.dataDir, 'chain.json');
    this.stateFile = path.join(this.dataDir, 'worldState.json');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.loadFromDisk();
    if (this.chain.length === 0) {
        this.chain.push(this.createGenesisBlock());
        this.saveToDisk();
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
    console.log(`[Processing TX ${id}] ${chaincodeName}.${functionName}`);

    if (chaincodeName === 'traceability') {
        if (functionName === 'RecordEvent') {
            const [productId, eventType, eventData] = originalArgs;
            if (!this.worldState.traceability[productId]) {
                this.worldState.traceability[productId] = [];
            }
            this.worldState.traceability[productId].push({
                txId: id,
                eventType: eventType,
                eventData: eventData,
                timestamp: timestamp,
                actorPublicKey: from,
                signature: signature
            });
            console.log(` -> Event '${eventType}' recorded for product ${productId}`);
        } else {
            console.warn(` -> Unknown function in traceability: ${functionName}`);
        }
    } else if (chaincodeName === 'reputation') {
        if (functionName === 'AddReviewRecord') {
            const [reviewId, orderId, sellerId, rating, commentHash] = originalArgs;
            const sellerReviewsKey = `REVIEWS_${sellerId}`;
             if (!this.worldState.reputation[sellerReviewsKey]) {
                this.worldState.reputation[sellerReviewsKey] = [];
            }
            this.worldState.reputation[sellerReviewsKey].push({
                txId: id,
                reviewId: reviewId,
                orderId: orderId,
                buyerPublicKey: from,
                sellerId: sellerId,
                rating: parseInt(rating),
                commentHash: commentHash,
                timestamp: timestamp,
                signature: signature
            });
            console.log(` -> Review ${reviewId} added for seller ${sellerId} by ${from.substring(0,20)}...`);
        } else {
            console.warn(` -> Unknown function in reputation: ${functionName}`);
        }
    } else if (chaincodeName === 'product') {
        if (functionName === 'CreateProduct') {
            const [productId, name, price, description, origin] = originalArgs;
            if (!this.worldState.products) this.worldState.products = {};
            if (!this.worldState.products[from]) this.worldState.products[from] = [];
            const newProduct = {
                txId: id,
                productId: productId,
                name: name,
                price: price,
                description: description,
                origin: origin,
                ownerPublicKey: from,
                timestamp: timestamp,
                signature: signature
            };
            this.worldState.products[from].push(newProduct);
            console.log(` -> Product ${name} (ID: ${productId}) created by ${from.substring(0,20)}...`);
        }
    } else if (chaincodeName === 'order') {
        if (functionName === 'CreateOrder') {
            const [orderId, productId, quantity, sellerPublicKey] = originalArgs;
            if (!this.worldState.orders) this.worldState.orders = {};
            const newOrder = {
                txId: id,
                orderId: orderId,
                productId: productId,
                quantity: quantity,
                buyerPublicKey: from,
                sellerPublicKey: sellerPublicKey,
                status: 'PENDING',
                timestamp: timestamp,
                signature: signature
            };
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
                } else {
                    console.warn(` -> Order ${orderId} cannot be shipped. Current status: ${order.status}`);
                }
            } else {
                console.error(` -> Order ${orderId} not found in world state for ConfirmShipment.`);
            }
        } else if (functionName === 'ConfirmDelivery') {
            const [orderId] = originalArgs;
             if (this.worldState.orders && this.worldState.orders[orderId]) {
                const order = this.worldState.orders[orderId];
                if (order.status === 'SHIPPED') {
                    order.status = 'DELIVERED';
                    order.deliveredAt = new Date(timestamp).toISOString();
                    console.log(` -> Order ${orderId} status updated to DELIVERED.`);
                } else {
                     console.warn(` -> Order ${orderId} cannot be delivered. Current status: ${order.status}`);
                }
            } else {
                console.error(` -> Order ${orderId} not found in world state for ConfirmDelivery.`);
            }
        }
    } else {
        console.warn(`[Processing TX ${id}] Unknown chaincode: ${chaincodeName}`);
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
    if (chaincodeName === 'traceability') {
        return this.worldState.traceability[key] || [];
    } else if (chaincodeName === 'reputation') {
        return this.worldState.reputation[key] || [];
    } else if (chaincodeName === 'product' && key === 'owner') {
        return this.worldState.products ? (this.worldState.products[subkey] || []) : [];
    } else if (chaincodeName === 'order' && key === 'id') {
        return this.worldState.orders ? this.worldState.orders[subkey] : null;
    } else if (chaincodeName === 'order' && key === 'buyer') {
        const buyerOrders = [];
        if (this.worldState.orders) {
            for (const orderId in this.worldState.orders) {
                if (this.worldState.orders[orderId].buyerPublicKey === subkey) {
                    buyerOrders.push(this.worldState.orders[orderId]);
                }
            }
        }
        return buyerOrders;
    } else if (chaincodeName === 'order' && key === 'seller') {
        const sellerOrders = [];
        if (this.worldState.orders) {
            for (const orderId in this.worldState.orders) {
                if (this.worldState.orders[orderId].sellerPublicKey === subkey) {
                    sellerOrders.push(this.worldState.orders[orderId]);
                }
            }
        }
        return sellerOrders;
    }
    console.warn(`[Query] Unknown query type: ${chaincodeName}/${key}`);
    return null;
  }

  saveToDisk() {
    try {
      fs.writeFileSync(this.chainFile, JSON.stringify(this.chain, null, 2));
      fs.writeFileSync(this.stateFile, JSON.stringify(this.worldState, null, 2));
      console.log('[Persistence] Blockchain data saved to disk.');
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
      
      if (fs.existsSync(this.stateFile)) {
        this.worldState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        console.log(`[Persistence] World state loaded from ${this.stateFile}.`);
        this.worldState.traceability = this.worldState.traceability || {};
        this.worldState.reputation = this.worldState.reputation || {};
        this.worldState.products = this.worldState.products || {};
        this.worldState.orders = this.worldState.orders || {};
      } else {
          this.worldState = { traceability: {}, reputation: {}, products: {}, orders: {} };
      }

      if (this.chain.length > 1 && !this.isChainValid()) {
        console.error("[Persistence] Loaded chain is invalid! Resetting to genesis block.");
        this.chain = [this.createGenesisBlock()];
        this.worldState = { traceability: {}, reputation: {}, products: {}, orders: {} };
        this.saveToDisk();
      } else if (this.chain.length > 0) {
          console.log("[Persistence] Loaded chain is valid.");
      }

    } catch (error) {
      console.error('[Persistence] Error loading blockchain data:', error);
      this.chain = this.chain || [];
      if (this.chain.length === 0) this.chain.push(this.createGenesisBlock());
      this.worldState = { traceability: {}, reputation: {}, products: {}, orders: {} };
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