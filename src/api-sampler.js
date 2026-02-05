// winna plinko sampler
// run this to collect samples from the live api
// usage: node api-sampler.js <count> [difficulty] [pins]

const CONFIG = {
    url: 'https://originals.winna.com/plinko/play',
    // paste your cookies from devtools here
    cookies: process.env.WINNA_COOKIES || '',
    // paste your token here
    token: process.env.WINNA_TOKEN || '',
    sid: process.env.WINNA_SID || '',
};

import fs from 'fs';

async function sample(difficulty = 'medium', pins = 16) {
    const res = await fetch(CONFIG.url, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'origin': 'https://games.winna.com',
            'referer': 'https://games.winna.com/',
            'cookie': CONFIG.cookies,
            'token': CONFIG.token,
            'sid': CONFIG.sid,
        },
        body: JSON.stringify({
            bet: 0,
            turbo: true,
            data: { difficulty, pins }
        })
    });

    if (!res.ok) {
        throw new Error(`api error: ${res.status}`);
    }

    return res.json();
}

async function collectSamples(count, difficulty, pins) {
    console.log(`collecting ${count} samples (${difficulty}, ${pins} pins)\n`);

    const results = [];
    const buckets = new Array(pins + 1).fill(0);
    let errors = 0;

    for (let i = 0; i < count; i++) {
        try {
            const r = await sample(difficulty, pins);
            results.push({
                id: r.id,
                bucket: r.data.bucket,
                multiplier: r.multiplier,
                ts: Date.now()
            });
            buckets[r.data.bucket]++;

            if ((i + 1) % 50 === 0) {
                console.log(`  ${i + 1}/${count}...`);
            }

            // small delay to not hammer the api
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            errors++;
            console.log(`  error at ${i}: ${e.message}`);
            if (errors > 10) {
                console.log('too many errors, stopping');
                break;
            }
        }
    }

    return { results, buckets, errors };
}

async function main() {
    const count = parseInt(process.argv[2]) || 100;
    const difficulty = process.argv[3] || 'medium';
    const pins = parseInt(process.argv[4]) || 16;

    if (!CONFIG.cookies && !CONFIG.token) {
        console.log('no auth configured!');
        console.log('set WINNA_COOKIES, WINNA_TOKEN, WINNA_SID env vars');
        console.log('or edit CONFIG in this file\n');
        console.log('get these from devtools network tab on winna.com');
        process.exit(1);
    }

    const { results, buckets, errors } = await collectSamples(count, difficulty, pins);

    console.log(`\ndone: ${results.length} samples, ${errors} errors\n`);

    // quick distribution
    console.log('bucket distribution:');
    for (let i = 0; i <= pins; i++) {
        const pct = (buckets[i] / results.length * 100).toFixed(1);
        const bar = '#'.repeat(Math.round(buckets[i] / results.length * 50));
        console.log(`  ${i.toString().padStart(2)}: ${buckets[i].toString().padStart(4)} (${pct}%) ${bar}`);
    }

    // save
    const filename = `./data/api_samples_${difficulty}_${pins}_${Date.now()}.json`;
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(filename, JSON.stringify({
        config: { difficulty, pins, count: results.length },
        buckets,
        results,
        ts: new Date().toISOString()
    }, null, 2));

    console.log(`\nsaved to ${filename}`);
    console.log('run: node src/analyze-samples.js ' + filename);
}

main().catch(e => console.error(e));
