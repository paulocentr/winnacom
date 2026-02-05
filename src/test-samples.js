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
const result = verify(testSeed, 'test', 0, 16);
console.log('seed:', testSeed);
console.log('hash:', result.hash);
console.log('path:', result.path.join(''));
console.log('slot:', result.slot, '(' + getMultiplier(result.slot, 16, 'low') + 'x on low)');

// determinism - same input should always give same output
const slots = [];
for (let i = 0; i < 5; i++) slots.push(verify(testSeed, 'test', 0, 16).slot);
console.log('\ndeterminism:', slots.every(s => s === slots[0]) ? 'ok' : 'FAIL');

// variance check
const s2 = [];
for (let n = 0; n < 100; n++) s2.push(verify(testSeed, 'test', n, 16).slot);
console.log('unique slots (100 nonces):', new Set(s2).size);

// verificar as seeds reais
const output = {
    selfTest: {
        seed: testSeed,
        slot: result.slot,
        deterministic: slots.every(s => s === slots[0]),
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
        const r = verify(s.server_seed, s.client_seed, s.nonce, s.rows || 16);
        const mult = getMultiplier(r.slot, s.rows || 16, s.risk || 'medium');

        // check commitment hash
        if (s.server_seed_hash) {
            const commitOk = verifyCommitment(s.server_seed, s.server_seed_hash);
            console.log(`#${s.id} commitment:`, commitOk ? 'ok' : 'BAD');
        }

        const ok = r.slot === s.expected_slot;
        console.log(`#${s.id}: slot ${r.slot} (${mult}x ${s.risk}) - expected ${s.expected_slot} (${s.expected_multiplier}x) - ${ok ? 'PASS' : 'FAIL'}`);
        ok ? output.pass++ : output.fail++;

        output.results.push({
            id: s.id,
            seed: s.server_seed,
            client: s.client_seed,
            nonce: s.nonce,
            risk: s.risk,
            got: r.slot,
            expected: s.expected_slot,
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
