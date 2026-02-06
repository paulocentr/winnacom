import crypto from 'crypto';

// FOUND THE ALGORITHM!
// winna uses Stake-style byte generator + probability distribution table
// NOT individual left/right pin decisions
// Source: XwnR1nwE.chunk.js from winna.com

const server = '59436d5114d239bc388947e9dcbe9546532bf9b8b1bd96669550ca124330d244';
const client = 'bc0077399f741f4e44c0d257820c0b55aa64f5836ab69f598c876f14205eee2e';

// payout table: Js["medium"][16]
const PAYOUTS = [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110];

// probability distribution: Wi["medium"][16]
const PROBS = [
    99993e-10, 299303e-10, 0.0018310547, 0.0085449219, 0.0277709961,
    0.0666503906, 0.1221923828, 0.1745605469, 0.1966054369, 0.1745605469,
    0.1221923828, 0.0666503906, 0.0277709961, 0.0085449219, 0.0018310547,
    0.0002441406, 99069e-10
];

// byte generator: HMAC-SHA256(serverSeed, clientSeed:nonce:cursor)
function* byteGenerator(serverSeed, clientSeed, nonce) {
    let cursor = 0;
    for (;;) {
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(`${clientSeed}:${nonce}:${cursor++}`);
        const buf = hmac.digest();
        for (let i = 0; i < 32; i++) yield buf[i];
    }
}

// generate 1 float from 4 bytes
function getFloat(serverSeed, clientSeed, nonce) {
    const gen = byteGenerator(serverSeed, clientSeed, nonce);
    const bytes = [];
    for (let i = 0; i < 4; i++) bytes.push(gen.next().value);
    return bytes.reduce((acc, b, i) => acc + b / Math.pow(256, i + 1), 0);
}

// determine bucket using probability table
function getBucket(serverSeed, clientSeed, nonce, probs) {
    const f = getFloat(serverSeed, clientSeed, nonce);
    let cumulative = 0;
    for (let i = 0; i < probs.length; i++) {
        cumulative += probs[i];
        if (f < cumulative) return i;
    }
    return probs.length - 1;
}

// round 2 history (30 bets, nonces 1-30)
// displayed multipliers have house edge (0.49x = slot 0.5x, 0.99x = slot 1x, 1.49x = slot 1.5x)
const history = [
    {n:1, m:0.5}, {n:2, m:1}, {n:3, m:0.3}, {n:4, m:1}, {n:5, m:1}, {n:6, m:0.5},
    {n:7, m:1.5}, {n:8, m:1.5}, {n:9, m:0.5}, {n:10, m:1}, {n:11, m:0.5}, {n:12, m:1},
    {n:13, m:0.3}, {n:14, m:1}, {n:15, m:1}, {n:16, m:0.5}, {n:17, m:1.5}, {n:18, m:1},
    {n:19, m:0.5}, {n:20, m:1}, {n:21, m:1}, {n:22, m:0.5}, {n:23, m:0.5}, {n:24, m:1},
    {n:25, m:1}, {n:26, m:0.5}, {n:27, m:1.5}, {n:28, m:0.5}, {n:29, m:0.5}, {n:30, m:1}
];

console.log('=== TESTING WINNA PLINKO ALGORITHM ===');
console.log('Algorithm: single float from HMAC byte generator → probability distribution table\n');

let matches = 0;
for (const h of history) {
    const bucket = getBucket(server, client, h.n, PROBS);
    const payout = PAYOUTS[bucket];
    const ok = payout === h.m;
    if (ok) matches++;
    console.log(`nonce ${String(h.n).padStart(2)}: float=${getFloat(server, client, h.n).toFixed(8)} bucket=${bucket} payout=${payout}x expected=${h.m}x ${ok ? 'OK' : 'FAIL'}`);
}

console.log(`\n=== RESULT: ${matches}/30 ===`);

// also test verify tab (round 2, nonces 0-5 that I confirmed manually)
console.log('\n--- Verify tab check (nonces 0-5) ---');
const verifyTab = [
    {n:0, m:0.3}, {n:1, m:0.5}, {n:2, m:1}, {n:3, m:0.3}, {n:4, m:1}, {n:5, m:1}
];
let vMatches = 0;
for (const v of verifyTab) {
    const bucket = getBucket(server, client, v.n, PROBS);
    const payout = PAYOUTS[bucket];
    const ok = payout === v.m;
    if (ok) vMatches++;
    console.log(`nonce ${v.n}: bucket=${bucket} payout=${payout}x expected=${v.m}x ${ok ? 'OK' : 'FAIL'}`);
}
console.log(`Verify tab: ${vMatches}/6`);
