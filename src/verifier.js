import crypto from 'crypto';

// plinko verifier - reconstroi o algoritmo do winna
// HMAC-SHA256(serverSeed, clientSeed:nonce), 4 bytes por row -> float -> L/R

function generateHash(serverSeed, clientSeed, nonce) {
    return crypto.createHmac('sha256', serverSeed)
        .update(`${clientSeed}:${nonce}`)
        .digest('hex');
}

function getFloat(hash, idx) {
    const start = idx * 8;
    if (start + 8 > hash.length) {
        // need more bytes, rehash
        const ext = crypto.createHash('sha256').update(hash + idx).digest('hex');
        return parseInt(ext.slice(0, 8), 16) / 0x100000000;
    }
    return parseInt(hash.slice(start, start + 8), 16) / 0x100000000;
}

function getPath(hash, rows) {
    const path = [];
    for (let i = 0; i < rows; i++) {
        path.push(getFloat(hash, i) < 0.5 ? 'L' : 'R');
    }
    return path;
}

function pathToSlot(path) {
    return path.filter(d => d === 'R').length;
}

function verify(serverSeed, clientSeed, nonce, rows = 16) {
    const hash = generateHash(serverSeed, clientSeed, nonce);
    const path = getPath(hash, rows);
    return { hash, path, slot: pathToSlot(path) };
}

function verifyCommitment(serverSeed, hash) {
    return crypto.createHash('sha256').update(serverSeed).digest('hex') === hash;
}

// tabelas de payout - winna chama de "difficulty" (low/medium/high/extreme)
// 16 pins conferido direto da UI, extreme tem skull (0x) nos slots do meio
const PAYOUTS = {
    8: {
        low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
        extreme: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] // 8-pin extreme unverified
    },
    12: {
        low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
        medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
        high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
        extreme: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] // 12-pin extreme unverified
    },
    16: {
        low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
        medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
        high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
        extreme: [2000, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 2000] // confirmed - skull slots = 0x
    }
};

function getMultiplier(slot, rows, risk) {
    return PAYOUTS[rows]?.[risk]?.[slot] ?? null;
}

// cli - rodar direto: node verifier.js <server> <client> <nonce> [rows] [risk]
if (process.argv[1].includes('verifier.js')) {
    const [serverSeed, clientSeed, nonce, rows, risk] = process.argv.slice(2);
    if (!serverSeed || !clientSeed) {
        console.log('node verifier.js <serverSeed> <clientSeed> <nonce> [rows] [risk]');
        process.exit(1);
    }
    const r = parseInt(rows) || 16;
    const result = verify(serverSeed, clientSeed, parseInt(nonce) || 0, r);
    console.log('Hash:', result.hash);
    console.log('Path:', result.path.join(''));
    console.log('Slot:', result.slot);
    console.log('Mult:', getMultiplier(result.slot, r, risk || 'medium') + 'x');
}

export { generateHash, getFloat, getPath, pathToSlot, verify, verifyCommitment, getMultiplier, PAYOUTS };
