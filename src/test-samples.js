import fs from 'fs';
import { verify, verifyCommitment, getMultiplier } from './verifier.js';

let samples;
try {
    samples = JSON.parse(fs.readFileSync('./data/sample_seeds.json', 'utf8'));
} catch (e) {
    samples = { rounds: [] };
}

// self test
console.log('--- self test ---\n');

const testSeed = 'a]Y`yJj5B=Kc5FD';
const result = verify(testSeed, 'test', 0, 16, 'low');
console.log('seed:', testSeed);
console.log('float:', result.float.toFixed(10));
console.log('bucket:', result.bucket, '(' + result.multiplier + 'x on low)');

// determinism - same input should always give same output
const buckets = [];
for (let i = 0; i < 5; i++) buckets.push(verify(testSeed, 'test', 0, 16, 'low').bucket);
console.log('\ndeterminism:', buckets.every(b => b === buckets[0]) ? 'ok' : 'FAIL');

// variance check
const s2 = [];
for (let n = 0; n < 100; n++) s2.push(verify(testSeed, 'test', n, 16, 'low').bucket);
console.log('unique buckets (100 nonces):', new Set(s2).size);

// verify real seeds
const output = {
    selfTest: {
        seed: testSeed,
        bucket: result.bucket,
        deterministic: buckets.every(b => b === buckets[0]),
    },
    results: [],
    pass: 0, fail: 0, skipped: 0,
    ts: new Date().toISOString()
};

if (samples.rounds?.length > 0) {
    console.log('\n--- sample verification ---\n');

    for (const s of samples.rounds) {
        if (!s.server_seed || s.server_seed.includes('REPLACE')) {
            console.log(`#${s.id}: skipped`);
            output.skipped++;
            continue;
        }
        const r = verify(s.server_seed, s.client_seed, s.nonce, s.rows || 16, s.risk || 'medium');
        const mult = r.multiplier;

        // check commitment hash
        if (s.server_seed_hash) {
            const commitOk = verifyCommitment(s.server_seed, s.server_seed_hash);
            console.log(`#${s.id} commitment:`, commitOk ? 'ok' : 'BAD');
        }

        const ok = r.bucket === s.expected_bucket;
        console.log(`#${s.id}: bucket ${r.bucket} (${mult}x ${s.risk}) - expected ${s.expected_bucket} (${s.expected_multiplier}x) - ${ok ? 'PASS' : 'FAIL'}`);
        ok ? output.pass++ : output.fail++;

        output.results.push({
            id: s.id,
            seed: s.server_seed,
            client: s.client_seed,
            nonce: s.nonce,
            risk: s.risk,
            got: r.bucket,
            expected: s.expected_bucket,
            ok,
            commitmentValid: s.server_seed_hash ? verifyCommitment(s.server_seed, s.server_seed_hash) : null
        });
    }
    console.log(`\n${output.pass} pass, ${output.fail} fail`);
} else {
    console.log('\n(no samples yet)');
}

fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/verification_results.json', JSON.stringify(output, null, 2));
console.log('\nsaved to data/verification_results.json');
