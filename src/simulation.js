import crypto from 'crypto';
import fs from 'fs';
import { verify, PAYOUTS } from './verifier.js';

function simulate(rounds = 100000, rows = 16, risk = 'medium') {
    console.log(`\nRunning ${rounds.toLocaleString()} rounds, ${rows} rows, ${risk} risk\n`);

    const payouts = PAYOUTS[rows]?.[risk];
    if (!payouts) {
        console.error(`bad config`);
        return;
    }

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const clientSeed = 'sim_test';

    let totalBet = 0;
    let totalPayout = 0;
    const slotCounts = new Array(rows + 1).fill(0);
    const start = Date.now();

    for (let nonce = 0; nonce < rounds; nonce++) {
        totalBet += 1;
        const result = verify(serverSeed, clientSeed, nonce, rows);
        totalPayout += payouts[result.slot];
        slotCounts[result.slot]++;

        if (nonce > 0 && nonce % 25000 === 0) {
            console.log(`  ${nonce.toLocaleString()}... RTP: ${(totalPayout/totalBet*100).toFixed(2)}%`);
        }
    }

    const elapsed = (Date.now() - start) / 1000;
    const rtp = (totalPayout / totalBet) * 100;

    // distribuicao esperada (binomial)
    const expectedDist = [];
    for (let k = 0; k <= rows; k++) {
        const prob = binom(rows, k) * Math.pow(0.5, rows);
        expectedDist.push(Math.round(prob * rounds));
    }

    console.log('\n--- RESULTS ---');
    console.log(`RTP: ${rtp.toFixed(4)}%`);
    console.log(`House edge: ${(100 - rtp).toFixed(4)}%`);
    console.log(`Time: ${elapsed.toFixed(1)}s`);

    console.log('\n--- DISTRIBUTION ---');
    let chiSq = 0;
    for (let i = 0; i <= rows; i++) {
        const exp = expectedDist[i];
        const diff = exp > 0 ? ((slotCounts[i] - exp) / exp * 100).toFixed(1) : '0';
        chiSq += exp > 0 ? Math.pow(slotCounts[i] - exp, 2) / exp : 0;
        console.log(`slot ${i}: ${slotCounts[i]} (exp ${exp}, ${diff}%) ${payouts[i]}x`);
    }

    console.log(`\nChi-sq: ${chiSq.toFixed(2)} (df=${rows})`);
    console.log(chiSq < 26.3 ? 'FAIR (p > 0.05)' : 'check this');

    // salvar resultado
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/simulation_results.json', JSON.stringify({
        config: { rounds, rows, risk },
        rtp: rtp.toFixed(4),
        chiSq: chiSq.toFixed(2),
        slotCounts,
        ts: new Date().toISOString()
    }, null, 2));
    console.log('\nsaved to data/simulation_results.json');
}

function binom(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

const rounds = parseInt(process.argv[2]) || 100000;
const rows = parseInt(process.argv[3]) || 16;
const risk = process.argv[4] || 'medium';
simulate(rounds, rows, risk);
