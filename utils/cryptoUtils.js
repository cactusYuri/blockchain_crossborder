const crypto = require('crypto');
const algorithm = 'aes-256-cbc'; // Encryption algorithm
const ivLength = 16; // Initialization Vector length for AES

// Function to generate RSA key pair
function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048, // Key size
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            // Optionally encrypt here, but we'll encrypt separately based on user password
            // cipher: 'aes-256-cbc', 
            // passphrase: 'top secret' 
        }
    });
    return { publicKey, privateKey };
}

// Function to encrypt data (e.g., private key) using a password-derived key
function encrypt(text, password) {
    const key = crypto.scryptSync(password, 'salt', 32); // Derive key from password
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Prepend IV for decryption
    return iv.toString('hex') + ':' + encrypted; 
}

// Function to decrypt data using a password-derived key
function decrypt(text, password) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const key = crypto.scryptSync(password, 'salt', 32); // Use the same salt as encryption
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error("Decryption failed:", error);
        // Handle decryption failure appropriately, e.g., return null or throw specific error
        throw new Error("Decryption failed. Incorrect password or corrupted data."); 
    }
}

// Function to sign data with a private key
function sign(data, privateKeyPem) {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    // Assuming privateKeyPem is in PEM format
    const signature = sign.sign(privateKeyPem, 'base64'); 
    return signature;
}

// Function to verify a signature with a public key
function verify(data, signature, publicKeyPem) {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    // Assuming publicKeyPem is in PEM format and signature is base64
    return verify.verify(publicKeyPem, signature, 'base64'); 
}

module.exports = {
    generateKeyPair,
    encrypt,
    decrypt,
    sign,
    verify
}; 