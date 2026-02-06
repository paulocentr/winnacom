// analyze collected samples
// usage: node analyze-samples.js <samples.json> [difficulty]

import fs from 'fs';

// payout tables - winna uses "difficulty" not "risk"
// 16-pin all difficulties confirmed from UI screenshots
// extreme uses skull icons (0x) for middle slots, 100x/2000x on edges
const PAYOUTS = {
    8: {
        low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
        extreme: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] // 8-pin unverified
    },
    12: {
        low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
        medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
        high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
        extreme: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] // 12-pin unverified
    },
    16: {
        low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
        medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
        high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
        extreme: [2000, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 2000]
    }
};

function binom(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

function expectedDist(pins, total) {
    const dist = [];
    for (let k = 0; k <= pins; k++) {
        dist.push(Math.round(binom(pins, k) * Math.pow(0.5, pins) * total));
    }
    return dist;
}

function analyze(data, difficultyOverride) {
    const { config, buckets, results } = data;
    const pins = config.pins;
    const difficulty = difficultyOverride || config.difficulty;
    const n = results.length;

    console.log(`\n=== analysis: ${n} samples, ${pins} pins, ${difficulty} ===\n`);

    // calc expected
    const expected = expectedDist(pins, n);

    // distribution comparison
    console.log('slot distribution vs expected:\n');
    let chiSq = 0;

    for (let i = 0; i <= pins; i++) {
        const obs = buckets[i];
        const exp = expected[i];
        const diff = exp > 0 ? ((obs - exp) / exp * 100).toFixed(1) : '0';
        chiSq += exp > 0 ? Math.pow(obs - exp, 2) / exp : 0;

        const bar = '#'.repeat(Math.min(30, Math.round(obs / n * 100)));
        console.log(`  ${i.toString().padStart(2)}: ${obs.toString().padStart(5)} vs ${exp.toString().padStart(5)} (${diff.padStart(6)}%) ${bar}`);
    }

    // chi squared
    const criticalVal = pins === 16 ? 26.3 : (pins === 12 ? 21.0 : 15.5);
    console.log(`\nchi-squared: ${chiSq.toFixed(2)}`);
    console.log(`critical (p=0.05, df=${pins}): ${criticalVal}`);
    console.log(chiSq < criticalVal ? '-> distribution looks FAIR' : '-> SUSPICIOUS - investigate');

    // RTP calc
    const payouts = PAYOUTS[pins]?.[difficulty];
    if (payouts) {
        let totalPayout = 0;
        for (let i = 0; i <= pins; i++) {
            totalPayout += buckets[i] * payouts[i];
        }
        const rtp = totalPayout / n * 100;

        // theoretical
        let theoRtp = 0;
        for (let k = 0; k <= pins; k++) {
            theoRtp += binom(pins, k) * Math.pow(0.5, pins) * payouts[k];
        }

        console.log(`\nRTP analysis:`);
        console.log(`  observed:    ${rtp.toFixed(2)}%`);
        console.log(`  theoretical: ${(theoRtp * 100).toFixed(2)}%`);
        console.log(`  difference:  ${(rtp - theoRtp * 100).toFixed(2)}%`);

        // confidence interval (rough)
        const stdErr = Math.sqrt(rtp * (100 - rtp) / n);
        console.log(`  95% CI:      ${(rtp - 1.96 * stdErr).toFixed(2)}% - ${(rtp + 1.96 * stdErr).toFixed(2)}%`);
    } else {
        console.log(`\n(no payout table for ${pins} pins ${difficulty})`);

        // still calc from actual multipliers
        let totalMult = 0;
        for (const r of results) {
            totalMult += r.multiplier;
        }
        console.log(`avg multiplier: ${(totalMult / n).toFixed(4)}x`);
        console.log(`implied RTP: ${(totalMult / n * 100).toFixed(2)}%`);
    }

    // L/R balance (inferred from distribution)
    let leftHeavy = 0, rightHeavy = 0;
    for (let i = 0; i <= pins; i++) {
        if (i < pins / 2) leftHeavy += buckets[i];
        else if (i > pins / 2) rightHeavy += buckets[i];
    }
    const lPct = (leftHeavy / (leftHeavy + rightHeavy) * 100).toFixed(1);
    console.log(`\nL/R balance: ${lPct}% left, ${(100 - parseFloat(lPct)).toFixed(1)}% right`);
    console.log(Math.abs(50 - parseFloat(lPct)) < 3 ? '-> balanced' : '-> slight bias?');

    // save analysis
    const analysis = {
        samples: n,
        pins,
        difficulty,
        chiSq: parseFloat(chiSq.toFixed(2)),
        fair: chiSq < criticalVal,
        buckets,
        expected,
        ts: new Date().toISOString()
    };

    fs.writeFileSync('./data/analysis_results.json', JSON.stringify(analysis, null, 2));
    console.log('\nsaved to data/analysis_results.json');
}

// main
const file = process.argv[2];
const diffOverride = process.argv[3];

if (!file) {
    console.log('usage: node analyze-samples.js <samples.json> [difficulty]');
    console.log('\nexample: node analyze-samples.js data/api_samples_medium_16_xxx.json');
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    analyze(data, diffOverride);
} catch (e) {
    console.error('error:', e.message);
}
