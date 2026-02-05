import crypto from 'crypto';

export const randomHex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (input) => crypto.createHash('sha256').update(input).digest('hex');
export const hmacSha256 = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest('hex');
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
