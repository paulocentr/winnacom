// manual sample collector
// paste game results here from browser console
// or run the snippet below in devtools

/*
BROWSER SNIPPET - paste this in devtools console on winna plinko:

const results = [];
const origFetch = window.fetch;
window.fetch = async (...args) => {
    const res = await origFetch(...args);
    if (args[0]?.includes?.('/plinko/play') || args[0] === 'https://originals.winna.com/plinko/play') {
        const clone = res.clone();
        const data = await clone.json();
        results.push({ bucket: data.data.bucket, mult: data.multiplier, id: data.id });
        console.log(`#${results.length}: bucket ${data.data.bucket}, ${data.multiplier}x`);
    }
    return res;
};
console.log('intercepting... play some games then run: copy(JSON.stringify(results))');

// after playing, run: copy(JSON.stringify(results))
// then paste below
*/

import fs from 'fs';

// PASTE YOUR RESULTS HERE
const SAMPLES = [
    // { bucket: 8, mult: 0.3 },
    // { bucket: 7, mult: 0.5 },
    // etc...
];

// or load from file
const file = process.argv[2];
let samples = SAMPLES;

if (file) {
    try {
        samples = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`loaded ${samples.length} samples from ${file}`);
    } catch (e) {
        console.log('could not load file, using SAMPLES array');
    }
}

if (samples.length === 0) {
    console.log('no samples!');
    console.log('either:');
    console.log('  1. paste samples in SAMPLES array in this file');
    console.log('  2. node manual-sampler.js samples.json');
    console.log('\nuse the browser snippet above to collect data');
    process.exit(1);
}

// analyze
const pins = 16; // adjust if different
const buckets = new Array(pins + 1).fill(0);
let totalMult = 0;

for (const s of samples) {
    buckets[s.bucket]++;
    totalMult += s.mult;
}

console.log(`\n--- ${samples.length} samples ---\n`);

// distribution
for (let i = 0; i <= pins; i++) {
    const pct = (buckets[i] / samples.length * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(buckets[i] / samples.length * 40));
    console.log(`${i.toString().padStart(2)}: ${buckets[i].toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
}

// rtp
const avgMult = totalMult / samples.length;
console.log(`\navg multiplier: ${avgMult.toFixed(4)}x`);
console.log(`implied RTP: ${(avgMult * 100).toFixed(2)}%`);

// chi-sq quick check
let chiSq = 0;
for (let k = 0; k <= pins; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (pins - i) / (i + 1);
    const exp = Math.round(c * Math.pow(0.5, pins) * samples.length);
    chiSq += exp > 0 ? Math.pow(buckets[k] - exp, 2) / exp : 0;
}
console.log(`chi-sq: ${chiSq.toFixed(2)} (critical ~26.3 for 16 pins)`);
console.log(chiSq < 26.3 ? '-> FAIR' : '-> check this');

// save
fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/manual_samples.json', JSON.stringify({
    pins,
    samples,
    buckets,
    avgMult,
    chiSq,
    ts: new Date().toISOString()
}, null, 2));
console.log('\nsaved to data/manual_samples.json');
