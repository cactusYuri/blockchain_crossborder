'use strict';

const crypto = require('crypto');

/**
 * Represents a single block in our simulated blockchain.
 */
class Block {
    constructor(index, timestamp, transactions, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions; // Data for this block (e.g., a single transaction)
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
        this.nonce = 0; // Simple nonce for demonstration, not a full PoW
    }

    calculateHash() {
        return crypto.createHash('sha256')
                   .update(this.index + this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce)
                   .digest('hex');
    }

    // Basic proof-of-work simulation (optional for demo)
    mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        console.log(`[Sim] Block Mined: ${this.hash} (nonce: ${this.nonce})`);
    }
}

/**
 * Manages the chain of blocks and the simulated state.
 */
class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2; // Basic difficulty for mining demo
        // --- Simulated State (replacing ledgers) ---
        this.traceabilityState = {}; // { productId: [event1, event2, ...] }
        this.reputationState = {};   // { sellerId: [review1, review2, ...] }
        // --- Transaction counter ---
        this.txCounter = 0;
    }

    createGenesisBlock() {
        return new Block(0, Date.now().toString(), "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Processes a transaction, updates state, and adds a new block.
     * This simulates submitting a transaction to the network.
     */
    addTransaction(transactionData) {
        console.log('[Sim] Processing transaction:', transactionData);
        let stateUpdateResult = null;

        // 1. Update the simulated state based on transaction type
        try {
            stateUpdateResult = this.updateSimulatedState(transactionData);
        } catch (error) {
            console.error('[Sim] State update failed:', error);
            throw new Error(`State update failed: ${error.message}`);
        }

        // 2. Create a new block containing this transaction
        const newBlock = new Block(
            this.getLatestBlock().index + 1,
            Date.now().toString(),
            transactionData, // Include original tx data in the block
            this.getLatestBlock().hash
        );

        // 3. Mine the block (optional demo)
        // newBlock.mineBlock(this.difficulty);

        // 4. Add the block to the chain
        this.chain.push(newBlock);
        console.log(`[Sim] Block added to chain. Chain length: ${this.chain.length}`);

        // Return the result of the state update (e.g., the created event/review)
        // Or return the block hash/index or a transaction ID
        return stateUpdateResult || `tx_${this.txCounter++}_${newBlock.hash.substring(0,6)}`;
    }

    /**
     * Internal function to modify the state based on transaction.
     * This simulates the logic within a smart contract.
     */
    updateSimulatedState(txData) {
        const { chaincodeName, functionName, args } = txData;

        if (chaincodeName === 'traceability') {
            if (functionName === 'RecordEvent') {
                const [productId, eventType, eventData, timestamp] = args;
                if (!this.traceabilityState[productId]) {
                    this.traceabilityState[productId] = [];
                }
                const event = {
                    txId: `tx_${this.txCounter++}_sim`, // Simple simulated TX ID
                    eventType,
                    eventData,
                    timestamp
                };
                this.traceabilityState[productId].push(event);
                console.log(`[Sim] State Update: Product ${productId} event ${eventType} recorded.`);
                return event; // Return the created event
            } else {
                throw new Error(`Traceability function ${functionName} not implemented in simulation.`);
            }
        } else if (chaincodeName === 'reputation') {
            if (functionName === 'AddReviewRecord') {
                const [reviewId, orderId, sellerId, buyerId, rating, commentHash, timestamp] = args;
                if (!this.reputationState[sellerId]) {
                    this.reputationState[sellerId] = [];
                }
                const review = {
                    txId: `tx_${this.txCounter++}_sim`,
                    reviewId,
                    orderId,
                    buyerId,
                    rating,
                    commentHash,
                    timestamp
                };
                this.reputationState[sellerId].push(review);
                console.log(`[Sim] State Update: Seller ${sellerId} review ${reviewId} recorded.`);
                return review; // Return the created review
            } else {
                throw new Error(`Reputation function ${functionName} not implemented in simulation.`);
            }
        } else {
            throw new Error(`Chaincode ${chaincodeName} not implemented in simulation.`);
        }
    }

    /**
     * Retrieves data directly from the simulated state.
     * This simulates querying a smart contract.
     */
    queryState(queryData) {
        console.log('[Sim] Processing query:', queryData);
        const { chaincodeName, functionName, args } = queryData;

        if (chaincodeName === 'traceability') {
            if (functionName === 'GetHistoryForProduct') {
                const [productId] = args;
                const history = this.traceabilityState[productId] || [];
                console.log(`[Sim] Query Result: Found ${history.length} events for product ${productId}.`);
                return history; // Return the actual array
            } else {
                throw new Error(`Traceability function ${functionName} not implemented in simulation.`);
            }
        } else if (chaincodeName === 'reputation') {
            if (functionName === 'GetSellerReviews') {
                const [sellerId] = args;
                const reviews = this.reputationState[sellerId] || [];
                console.log(`[Sim] Query Result: Found ${reviews.length} reviews for seller ${sellerId}.`);
                return reviews; // Return the actual array
            } else {
                throw new Error(`Reputation function ${functionName} not implemented in simulation.`);
            }
        } else {
            throw new Error(`Chaincode ${chaincodeName} not implemented in simulation.`);
        }
    }

    // Optional: Basic chain validation demo
    isChainValid() {
        for (let i = 1; i < this.chain.length; i++){
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                console.error("[Sim Validation] Invalid hash for block:", currentBlock);
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                console.error("[Sim Validation] Invalid previous hash link:", currentBlock);
                return false;
            }
        }
        return true;
    }
}

// --- Service Setup ---

// Create a single instance of the blockchain simulation for the application lifetime
const blockchainInstance = new Blockchain();

console.log('[Sim] Blockchain Simulation Service Initialized.');

// --- Exported Functions (Mimicking fabricService API) ---

/**
 * Simulates submitting a transaction.
 * Updates state and adds a block to the simulated chain.
 */
exports.submitTransaction = async (chaincodeName, functionName, ...args) => {
    // Structure the data like a transaction proposal
    const transactionData = {
        chaincodeName,
        functionName,
        args
    };
    try {
        // Add the transaction to our simulated blockchain
        const result = blockchainInstance.addTransaction(transactionData);
        // Ensure the returned value is stringified if the calling code expects it
        // (Original fabricService returned stringified JSON for queries)
        // For submits, returning the direct result might be okay, or a txId.
        return result; 
    } catch (error) {
        console.error(`[Sim] submitTransaction Error:`, error);
        // Re-throw the error so the calling controller can handle it
        throw error;
    }
};

/**
 * Simulates querying data from the 'ledger'.
 * Reads directly from the simulated state.
 */
exports.evaluateTransaction = async (chaincodeName, functionName, ...args) => {
    const queryData = {
        chaincodeName,
        functionName,
        args
    };
    try {
        const result = blockchainInstance.queryState(queryData);
        // IMPORTANT: Original fabricService returned JSON strings for evaluate.
        // We need to match that behavior if controllers expect it.
        return JSON.stringify(result);
    } catch (error) {
        console.error(`[Sim] evaluateTransaction Error:`, error);
        throw error;
    }
};

// Optional: Export the instance if needed for debugging or direct access elsewhere
// exports.blockchainInstance = blockchainInstance; 