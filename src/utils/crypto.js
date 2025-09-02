import aes from 'aes-js';

const key = aes.utils.utf8.toBytes(process.env.AES_KEY);
if (key.length !== 32) throw new Error('Invalid key for AES. Must be 256-bit / 32 bytes.');

export function encrypt(text) {
    const bytesInfo = aes.utils.utf8.toBytes(text);
    const aesCTR = new aes.ModeOfOperation.ctr(key);
    const encryptedBytes = aesCTR.encrypt(bytesInfo);
    const encryptedHex = aes.utils.hex.fromBytes(encryptedBytes);
    return encryptedHex;
}

export function decrypt(encryptedHex) {
    const encryptedBytes = aes.utils.hex.toBytes(encryptedHex);
    const aesCTR = new aes.ModeOfOperation.ctr(key);
    const decryptedBytes = aesCTR.decrypt(encryptedBytes);
    const text = aes.utils.utf8.fromBytes(decryptedBytes);
    return text;
}