const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

// --- 配置区域 --- 
// 你需要根据你的实际 Fabric 网络配置修改这些路径和名称
const CCP_PATH = path.resolve(__dirname, '..', 'config', 'connection-profile.json'); // 指向你的连接配置文件
const WALLET_PATH = path.resolve(__dirname, '..', 'wallet'); // 指向你的钱包目录
const CHANNEL_NAME = 'mychannel'; // 你的通道名称

// --- 辅助函数 --- 

/**
 * 连接到 Fabric 网络并获取合约实例
 * @param {string} userId - 用于连接的用户身份标识 (必须在钱包中存在)
 * @param {string} chaincodeName - 链码名称
 * @param {string} contractName - 链码内的合约名称 (如果链码包含多个合约)
 * @returns {Promise<import('fabric-network').Contract>} 合约对象
 * @throws {Error} 如果连接失败或找不到身份/合约
 */
async function getContract(userId, chaincodeName, contractName) {
    console.log(`[fabricHelper] Attempting to get contract for user: ${userId}, chaincode: ${chaincodeName}, contract: ${contractName}`);
    
    try {
        // 检查连接配置文件是否存在
        if (!fs.existsSync(CCP_PATH)) {
            console.error(`[fabricHelper] Error: Connection profile not found at ${CCP_PATH}`);
            throw new Error(`Connection profile not found at ${CCP_PATH}`);
        }
        const ccp = JSON.parse(fs.readFileSync(CCP_PATH, 'utf8'));

        // 创建一个新的文件系统钱包用于管理身份
        const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
        console.log(`[fabricHelper] Wallet path: ${WALLET_PATH}`);

        // 检查用户身份是否存在于钱包中
        const identity = await wallet.get(userId);
        if (!identity) {
            console.error(`[fabricHelper] Error: An identity for the user "${userId}" does not exist in the wallet`);
            throw new Error(`An identity for the user "${userId}" does not exist in the wallet. Register the user first.`);
        }

        // 创建一个新的网关用于连接到 Peer 节点
        const gateway = new Gateway();
        console.log('[fabricHelper] Connecting to gateway...');
        await gateway.connect(ccp, { 
            wallet, 
            identity: userId, 
            discovery: { enabled: true, asLocalhost: true } // 根据网络配置调整 discovery 设置
        });

        // 获取网络（通道）
        const network = await gateway.getNetwork(CHANNEL_NAME);
        console.log(`[fabricHelper] Connected to channel: ${CHANNEL_NAME}`);

        // 获取合约
        let contract;
        if (contractName) {
            contract = network.getContract(chaincodeName, contractName);
            console.log(`[fabricHelper] Got contract: ${chaincodeName} (${contractName})`);
        } else {
            contract = network.getContract(chaincodeName);
            console.log(`[fabricHelper] Got contract: ${chaincodeName}`);
        }

        // 重要：这里返回合约对象，但没有处理网关断开连接。
        // 在实际应用中，你可能需要在调用完成后手动断开网关，
        // 或者设计一个更复杂的连接管理机制。
        // gateway.disconnect(); 

        return contract;

    } catch (error) {
        console.error(`[fabricHelper] Failed to get contract: ${error}`);
        // 抛出更具体的错误信息，方便调试
        throw new Error(`Failed to get Fabric contract: ${error.message}`);
    }
}

/**
 * (可选) 用于断开网关连接的函数
 * 如果 getContract 创建了网关，需要在适当的时候调用此函数释放资源
 * @param {import('fabric-network').Gateway} gateway - 需要断开的网关实例
 */
function disconnectGateway(gateway) {
    if (gateway && typeof gateway.disconnect === 'function') {
        console.log('[fabricHelper] Disconnecting gateway...');
        gateway.disconnect();
    }
}

module.exports = {
    getContract,
    disconnectGateway, // 如果需要外部管理连接断开，则导出
}; 