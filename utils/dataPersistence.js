const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * 加载指定名称的 JSON 数据文件
 * @param {string} dataName - 数据文件的名称 (例如 'users', 'products')
 * @param {any} defaultValue - 如果文件不存在或解析失败时返回的默认值 (通常是 [])
 * @returns {any} 解析后的数据或默认值
 */
function loadData(dataName, defaultValue = []) {
    const filePath = path.join(dataDir, `${dataName}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            // Handle empty file case
            if (!fileContent) {
                console.log(`[Persistence] Data file '${dataName}.json' is empty. Returning default value.`);
                return defaultValue;
            }
            const data = JSON.parse(fileContent);
            console.log(`[Persistence] Data loaded from ${dataName}.json`);
            return data;
        } else {
            console.log(`[Persistence] Data file '${dataName}.json' not found. Returning default value.`);
            return defaultValue;
        }
    } catch (error) {
        console.error(`[Persistence] Error loading data from ${dataName}.json:`, error);
        // In case of error (e.g., corrupted JSON), return default value
        return defaultValue;
    }
}

/**
 * 保存数据到指定名称的 JSON 文件
 * @param {string} dataName - 数据文件的名称 (例如 'users', 'products')
 * @param {any} data - 要保存的数据 (通常是数组)
 */
function saveData(dataName, data) {
    const filePath = path.join(dataDir, `${dataName}.json`);
    try {
        // Ensure data is an array or object before stringifying
        const dataToSave = data || (Array.isArray(data) ? [] : {}); 
        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
        console.log(`[Persistence] Data saved to ${dataName}.json`);
    } catch (error) {
        console.error(`[Persistence] Error saving data to ${dataName}.json:`, error);
        // Consider how to handle save errors - potentially log and continue?
    }
}

module.exports = {
    loadData,
    saveData
}; 