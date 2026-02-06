import crypto from 'crypto';
import fs from 'fs';
import { verify, PAYOUTS, PROB_TABLES } from './verifier.js';

// simulation using winna's actual algorithm
// byte generator + cumulative probability (NOT per-pin L/R)

function binom(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

function simulate(rounds = 100000, pins = 16, difficulty = 'medium') {
    console.log(`\nSimulation: ${rounds.toLocaleString()} rounds, ${pins} pins, ${difficulty}`);
    console.log('Algorithm: byte generator + cumulative probability (winna actual)\n');

    const payouts = PAYOUTS[pins]?.[difficulty];
    if (!payouts) {
        console.error(`no payout table for ${pins} pins ${difficulty}`);
        return;
    }

    const probs = PROB_TABLES[difficulty]?.[pins];
    if (!probs) {
        console.error(`no prob table for ${difficulty}/${pins}`);
        return;
    }

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const clientSeed = 'sim_test';

    let totalBet = 0;
    let totalPayout = 0;
    const bucketCounts = new Array(pins + 1).fill(0);
    const start = Date.now();

    for (let nonce = 0; nonce < rounds; nonce++) {
        totalBet += 1;
        const result = verify(serverSeed, clientSeed, nonce, pins, difficulty);
        totalPayout += result.multiplier;
        bucketCounts[result.bucket]++;

        if (nonce > 0 && nonce % 25000 === 0) {
            console.log(`  ${nonce.toLocaleString()}... RTP: ${(totalPayout/totalBet*100).toFixed(2)}%`);
        }
    }

    const elapsed = (Date.now() - start) / 1000;
    const rtp = (totalPayout / totalBet) * 100;

    // expected distribution from winna's actual probability table
    const expectedFromProbs = probs.map(p => Math.round(p * rounds));
    // expected distribution from theoretical binomial (for comparison)
    const expectedBinomial = [];
    for (let k = 0; k <= pins; k++) {
        expectedBinomial.push(Math.round(binom(pins, k) * Math.pow(0.5, pins) * rounds));
    }

    console.log('\n--- RESULTS ---');
    console.log(`RTP: ${rtp.toFixed(4)}%`);
    console.log(`House edge: ${(100 - rtp).toFixed(4)}%`);
    console.log(`Time: ${elapsed.toFixed(1)}s`);

    // chi-squared against winna's distribution (prob tables)
    console.log('\n--- DISTRIBUTION (vs winna prob table) ---');
    let chiSqProb = 0;
    let chiSqBinom = 0;
    for (let i = 0; i <= pins; i++) {
        const expP = expectedFromProbs[i];
        const expB = expectedBinomial[i];
        const diffP = expP > 0 ? ((bucketCounts[i] - expP) / expP * 100).toFixed(1) : '0';
        chiSqProb += expP > 0 ? Math.pow(bucketCounts[i] - expP, 2) / expP : 0;
        chiSqBinom += expB > 0 ? Math.pow(bucketCounts[i] - expB, 2) / expB : 0;
        console.log(`bucket ${i.toString().padStart(2)}: ${bucketCounts[i].toString().padStart(6)} (prob ${expP.toString().padStart(6)}, binom ${expB.toString().padStart(6)}) ${payouts[i]}x`);
    }

    const criticalVal = pins === 16 ? 26.3 : (pins === 12 ? 21.0 : (pins === 8 ? 15.5 : 26.3));
    console.log(`\nChi-sq vs prob table: ${chiSqProb.toFixed(2)} (df=${pins})`);
    console.log(`Chi-sq vs binomial:   ${chiSqBinom.toFixed(2)} (df=${pins})`);
    console.log(`Critical (p=0.05):    ${criticalVal}`);
    console.log(chiSqProb < criticalVal ? 'FAIR (vs prob table)' : 'CHECK (vs prob table)');
    console.log(chiSqBinom < criticalVal ? 'FAIR (vs binomial)' : 'CHECK (vs binomial)');

    // theoretical RTP
    let theoRtp = 0;
    for (let i = 0; i <= pins; i++) {
        theoRtp += probs[i] * payouts[i];
    }
    console.log(`\nTheoretical RTP (prob table * payouts): ${(theoRtp * 100).toFixed(4)}%`);
    console.log(`Observed RTP: ${rtp.toFixed(4)}%`);
    console.log(`Difference: ${(rtp - theoRtp * 100).toFixed(4)}%`);

    // L/R symmetry
    let left = 0, right = 0;
    for (let i = 0; i <= pins; i++) {
        if (i < pins / 2) left += bucketCounts[i];
        else if (i > pins / 2) right += bucketCounts[i];
    }
    const lPct = (left / (left + right) * 100).toFixed(2);
    console.log(`\nL/R balance: ${lPct}% / ${(100 - parseFloat(lPct)).toFixed(2)}%`);

    // save
    fs.mkdirSync('./data', { recursive: true });
    const result = {
        config: { rounds, pins, difficulty, algorithm: 'byte_generator_cumulative_prob' },
        rtp: rtp.toFixed(4),
        theoretical_rtp: (theoRtp * 100).toFixed(4),
        chiSq_prob: chiSqProb.toFixed(2),
        chiSq_binom: chiSqBinom.toFixed(2),
        fair_prob: chiSqProb < criticalVal,
        fair_binom: chiSqBinom < criticalVal,
        bucketCounts,
        expectedFromProbs,
        expectedBinomial,
        ts: new Date().toISOString()
    };
    fs.writeFileSync('./data/simulation_results.json', JSON.stringify(result, null, 2));
    console.log('\nsaved to data/simulation_results.json');
}

const rounds = parseInt(process.argv[2]) || 100000;
const pins = parseInt(process.argv[3]) || 16;
const difficulty = process.argv[4] || 'medium';
simulate(rounds, pins, difficulty);
