import { verify, verifyCommitment } from './verifier.js';
import { readFileSync, writeFileSync } from 'fs';

// cryptographic bet-by-bet verification
// uses winna's real algorithm: byte generator float -> probability table
// takes extension export + revealed server seed and verifies everything

const args = process.argv.slice(2);

// parse flags
let exportFile = null;
let revealedSeed = null;
let hashedOverride = null;
let clientSeedOverride = null;
let startNonce = null;

const positional = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--client-seed' && args[i+1]) {
        clientSeedOverride = args[++i];
    } else if (args[i] === '--start-nonce' && args[i+1]) {
        startNonce = parseInt(args[++i]);
    } else if (args[i] === '--hash' && args[i+1]) {
        hashedOverride = args[++i];
    } else {
        positional.push(args[i]);
    }
}

exportFile = positional[0];
revealedSeed = positional[1];
if (!hashedOverride) hashedOverride = positional[2] || null;

if (!exportFile || !revealedSeed) {
    console.log('usage: node src/verify-bets.js <export.json> <revealed_server_seed> [hashed_server_seed]');
    console.log('');
    console.log('  optional flags (when extension didnt capture seeds):');
    console.log('    --client-seed <seed>    client seed used during the bets');
    console.log('    --start-nonce <n>       nonce of the first bet (default: 0)');
    console.log('    --hash <hash>           server seed hash (to verify commitment)');
    process.exit(1);
}

let exportData;
try {
    exportData = JSON.parse(readFileSync(exportFile, 'utf8'));
} catch(e) {
    console.error('error reading file:', e.message);
    process.exit(1);
}

const bets = exportData.results || exportData;

if (!bets.length) {
    console.error('no bets found in file');
    process.exit(1);
}

// sort by timestamp
bets.sort((a, b) => (a.ts || 0) - (b.ts || 0));

console.log(`\n=== CRYPTOGRAPHIC VERIFICATION ===`);
console.log(`file: ${exportFile}`);
console.log(`bets: ${bets.length}`);
console.log(`revealed server seed: ${revealedSeed}`);
if (clientSeedOverride) console.log(`client seed (manual): ${clientSeedOverride}`);
if (startNonce !== null) console.log(`start nonce (manual): ${startNonce}`);

// 1. verify commitment
const hashedFromBets = hashedOverride || bets[0]?.serverSeedHash;

if (hashedFromBets) {
    const commitOk = verifyCommitment(revealedSeed, hashedFromBets);
    console.log(`\n--- COMMITMENT ---`);
    console.log(`recorded hash: ${hashedFromBets}`);
    console.log(`SHA-256(revealed) match: ${commitOk ? 'YES' : '*** FAILED ***'}`);
    if (!commitOk) {
        console.log('WARNING: server seed does not match hash! possible manipulation');
    }
} else {
    console.log('\n--- COMMITMENT ---');
    console.log('no server seed hash available - pass --hash <hash> to verify commitment');
}

// 2. verify each bet
console.log(`\n--- BET-BY-BET VERIFICATION ---`);

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const nonces = [];
const details = [];

for (let i = 0; i < bets.length; i++) {
    const bet = bets[i];
    const clientSeed = bet.clientSeed || clientSeedOverride;
    const nonce = bet.nonce ?? (startNonce !== null ? startNonce + i : null);
    const pins = bet.pins || 16;
    const difficulty = bet.difficulty || 'medium';

    if (clientSeed === null || clientSeed === undefined || nonce === null || nonce === undefined) {
        skipped++;
        continue;
    }

    nonces.push(nonce);

    const result = verify(revealedSeed, clientSeed, nonce, pins, difficulty);

    const ok = result.bucket === bet.bucket;
    details.push({
        nonce,
        computed_bucket: result.bucket,
        computed_mult: result.multiplier,
        expected_bucket: bet.bucket,
        expected_mult: bet.mult,
        float: result.float,
        ok
    });

    if (ok) {
        passed++;
    } else {
        failed++;
        failures.push({
            id: bet.id,
            nonce,
            computed_bucket: result.bucket,
            computed_mult: result.multiplier,
            expected_bucket: bet.bucket,
            expected_mult: bet.mult,
            float: result.float
        });
    }
}

console.log(`verified: ${passed + failed}`);
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
if (skipped > 0) console.log(`no seed data: ${skipped}`);

if (failures.length > 0) {
    console.log('\n*** FAILED BETS ***');
    for (const f of failures) {
        console.log(`  nonce=${f.nonce} float=${f.float.toFixed(8)} computed=${f.computed_bucket}(${f.computed_mult}x) expected=${f.expected_bucket}(${f.expected_mult}x)`);
    }
}

// 3. verify nonce sequence
console.log(`\n--- NONCE SEQUENCE ---`);
if (nonces.length > 0) {
    nonces.sort((a, b) => a - b);
    const min = nonces[0];
    const max = nonces[nonces.length - 1];
    const expectedCount = max - min + 1;
    const gaps = [];

    for (let i = 1; i < nonces.length; i++) {
        if (nonces[i] - nonces[i-1] > 1) {
            gaps.push({ from: nonces[i-1], to: nonces[i], missing: nonces[i] - nonces[i-1] - 1 });
        }
    }

    console.log(`range: ${min} -> ${max}`);
    console.log(`total: ${nonces.length} (expected ${expectedCount})`);

    if (gaps.length === 0) {
        console.log('sequence: CONTINUOUS (no gaps)');
    } else {
        console.log(`gaps found: ${gaps.length}`);
        for (const g of gaps) {
            console.log(`  gap: ${g.from} -> ${g.to} (${g.missing} missing)`);
        }
    }

    const dupes = nonces.filter((v, i) => nonces[i+1] === v);
    if (dupes.length > 0) {
        console.log(`WARNING: ${dupes.length} duplicate nonces: ${dupes.join(', ')}`);
    } else {
        console.log('duplicates: none');
    }
} else {
    console.log('no nonce data to verify');
}

// 4. summary
const commitOk = hashedFromBets ? verifyCommitment(revealedSeed, hashedFromBets) : null;

const report = {
    file: exportFile,
    server_seed_revealed: revealedSeed,
    server_seed_hash: hashedFromBets || null,
    client_seed: clientSeedOverride || bets[0]?.clientSeed || null,
    commitment_valid: commitOk,
    total_bets: bets.length,
    verified: passed + failed,
    passed,
    failed,
    skipped,
    pass_rate: passed + failed > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) + '%' : null,
    nonce_range: nonces.length > 0 ? { min: nonces[0], max: nonces[nonces.length - 1] } : null,
    nonce_gaps: nonces.length > 0 ? (() => {
        const gaps = [];
        for (let i = 1; i < nonces.length; i++) {
            if (nonces[i] - nonces[i-1] > 1) gaps.push({ from: nonces[i-1], to: nonces[i] });
        }
        return gaps;
    })() : [],
    failures,
    details,
    ts: new Date().toISOString()
};

console.log('\n=== FINAL RESULT ===');
if (commitOk === true && failed === 0 && passed > 0) {
    console.log(`VERIFIED - ${passed}/${passed} bets match the server seed`);
} else if (commitOk === false) {
    console.log('FAILED - server seed commitment does not match');
} else if (failed > 0) {
    console.log(`FAILED - ${failed} bets do not match`);
} else if (skipped === bets.length) {
    console.log('NO SEED DATA - use --client-seed and --start-nonce');
} else {
    console.log('PARTIAL - incomplete verification');
}

// save
const outFile = exportFile.replace('.json', '_verified.json');
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\nresult saved to: ${outFile}`);
