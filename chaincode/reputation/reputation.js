'use strict';

const fs = require('fs');
const path = require('path');

// Define the path for the persistence file relative to this script's location
const dataFilePath = path.join(__dirname, '..', '..', 'data', 'reviews.json');

// No Fabric dependencies needed for local simulation
// const { Contract } = require('fabric-contract-api');

// Simple counter for simulating transaction IDs
let txCounter = 0;

class ReputationContractLocal { // Renamed to avoid confusion

    constructor() {
        console.info('Initializing Local Reputation Ledger with Persistence...');
        // Use Maps to simulate the key-value state store
        this.reputations = new Map(); // Key: `REP_${merchantId}`, Value: reputation object
        this.reviews = new Map();     // Key: `Review_${merchantId}_${reviewId}`, Value: review object
        this._loadData(); // Load existing data from file first
        // initLedger might overwrite loaded data if not careful, maybe remove or adapt
        // this.initLedger();
        console.info('Local Reputation Ledger Initialized.');
    }

    // Load data from the JSON file
    _loadData() {
        try {
            if (fs.existsSync(dataFilePath)) {
                const data = fs.readFileSync(dataFilePath, 'utf8');
                if (data) {
                    const jsonData = JSON.parse(data);
                    // Convert arrays back to Maps
                    if (jsonData.reputations) {
                        this.reputations = new Map(jsonData.reputations);
                    }
                    if (jsonData.reviews) {
                        this.reviews = new Map(jsonData.reviews);
                        // Find the max txCounter from loaded reviews if necessary
                        let maxId = 0;
                        this.reviews.forEach(review => {
                            const idPart = review.reviewId.split('_').pop();
                            const num = parseInt(idPart, 10);
                            if (!isNaN(num) && num > maxId) {
                                maxId = num;
                            }
                        });
                        txCounter = maxId; // Resume counter from last known ID
                    }
                    console.info(`Loaded data from ${dataFilePath}`);
                } else {
                     console.info(`${dataFilePath} is empty. Starting fresh.`);
                }
            } else {
                console.info(`${dataFilePath} not found. Starting fresh.`);
            }
        } catch (error) {
            console.error(`Error loading data from ${dataFilePath}:`, error);
            // Decide if you want to start fresh or throw error
            console.warn('Starting with empty data due to load error.');
            this.reputations = new Map();
            this.reviews = new Map();
            txCounter = 0;
        }
    }

    // Save data to the JSON file
    _saveData() {
        try {
            // Convert Maps to arrays of [key, value] pairs for JSON serialization
            const dataToSave = {
                reputations: Array.from(this.reputations.entries()),
                reviews: Array.from(this.reviews.entries())
            };
            const jsonData = JSON.stringify(dataToSave, null, 2); // Pretty print JSON
            fs.writeFileSync(dataFilePath, jsonData, 'utf8');
            // console.info(`Data successfully saved to ${dataFilePath}`); // Optional: logs can be noisy
        } catch (error) {
            console.error(`Error saving data to ${dataFilePath}:`, error);
            // Handle error appropriately - maybe retry, log, or alert
        }
    }

    // Simulate ctx.stub.getTxID()
    _getNextTxId() {
        txCounter++;
        return `localTx_${Date.now()}_${txCounter}`;
    }

    // Simulate ctx.stub.createCompositeKey()
    _createCompositeKey(objectType, attributes) {
        // Simple simulation: join attributes with a separator
        return `${objectType}_${attributes.join('_')}`;
    }

    /**
     * 提交评价 (Local Simulation with Persistence)
     * No ctx parameter needed now
     * @param {string} userId 用户ID
     * @param {string} merchantId 商家ID
     * @param {string} orderId 关联订单ID
     * @param {number} rating 评分 (e.g., 1-5)
     * @param {string} comment 评论内容
     */
    async submitReview(userId, merchantId, orderId, rating, comment) {
        console.info('============= START : submitReview (Local) ===========');

        rating = parseInt(rating, 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            throw new Error('Rating must be an integer between 1 and 5.');
        }
        if (!userId || !merchantId || !orderId) {
            throw new Error('User ID, Merchant ID, and Order ID are required.');
        }

        const timestamp = new Date().toISOString();
        const reviewId = this._getNextTxId();

        const review = {
            reviewId: reviewId,
            userId: userId,
            merchantId: merchantId,
            orderId: orderId,
            rating: rating,
            comment: comment || '',
            timestamp: timestamp,
            docType: 'review'
        };

        const reviewKey = this._createCompositeKey('Review', [merchantId, reviewId]);
        this.reviews.set(reviewKey, review);
        console.info(`Review ${reviewId} submitted locally for merchant ${merchantId} regarding order ${orderId}`);

        const reputationKey = `REP_${merchantId}`;
        let reputation = this.reputations.get(reputationKey);

        if (!reputation) {
            reputation = {
                merchantId: merchantId,
                totalRatingSum: rating,
                reviewCount: 1,
                averageRating: rating.toFixed(2),
                docType: 'reputation'
            };
        } else {
            reputation.totalRatingSum += rating;
            reputation.reviewCount += 1;
            reputation.averageRating = (reputation.totalRatingSum / reputation.reviewCount).toFixed(2);
        }

        this.reputations.set(reputationKey, reputation);
        console.info(`Local Reputation updated for merchant ${merchantId}: Avg Rating ${reputation.averageRating}, Count ${reputation.reviewCount}`);

        // Save data after modification
        this._saveData();

        console.info('============= END : submitReview (Local) ===========');
        return review;
    }

    /**
     * 根据商家ID获取所有评价 (Local Simulation)
     * @param {string} merchantId 商家ID
     */
    async getReviewsByMerchant(merchantId) {
        console.info(`============= START : getReviewsByMerchant (Local) ${merchantId} ===========`);
        const matchingReviews = [];
        const keyPrefix = `Review_${merchantId}_`; // Prefix for composite key

        // Simulate getStateByPartialCompositeKey by iterating through the map
        for (const [key, value] of this.reviews.entries()) {
            if (key.startsWith(keyPrefix)) {
                matchingReviews.push(value);
            }
        }

        console.info(`Found ${matchingReviews.length} local reviews for merchant ${merchantId}`);
        console.info(`============= END : getReviewsByMerchant (Local) ${merchantId} ===========`);
        // Return array directly
        return matchingReviews;
    }

     /**
     * 获取商家信誉信息 (Local Simulation)
     * @param {string} merchantId 商家ID
     */
     async getMerchantReputation(merchantId) {
        console.info(`============= START : getMerchantReputation (Local) ${merchantId} ===========`);
        const reputationKey = `REP_${merchantId}`;
        const reputation = this.reputations.get(reputationKey); // Simulate getState

        if (!reputation) {
             console.info(`No local reputation record found for merchant ${merchantId}. Returning default.`);
             const defaultReputation = {
                 merchantId: merchantId,
                 totalRatingSum: 0,
                 reviewCount: 0,
                 averageRating: "0.00",
                 docType: 'reputation'
             };
             return defaultReputation; // Return object directly
        }

        console.info(`Local Reputation retrieved for merchant ${merchantId}`);
        console.info(`============= END : getMerchantReputation (Local) ${merchantId} ===========`);
        return reputation; // Return object directly
    }
}

// Export the local version
module.exports = ReputationContractLocal; 