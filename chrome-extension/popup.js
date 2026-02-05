// popup logic

function binom(n, k) {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

function analyze(results) {
    if (!results || results.length === 0) return { count: 0 };

    const pins = results[0]?.pins || 16;
    const n = results.length;
    const buckets = new Array(pins + 1).fill(0);
    let totalMult = 0;

    for (const r of results) {
        buckets[r.bucket]++;
        totalMult += r.mult;
    }

    let chiSq = 0;
    for (let k = 0; k <= pins; k++) {
        const prob = binom(pins, k) * Math.pow(0.5, pins);
        const exp = prob * n;
        chiSq += exp > 0 ? Math.pow(buckets[k] - exp, 2) / exp : 0;
    }

    return { count: n, pins, buckets, avgMult: totalMult / n, rtp: (totalMult / n) * 100, chiSq, fair: chiSq < 26.3 };
}

function updateUI(stats) {
    document.getElementById('count').textContent = stats.count;

    if (stats.count === 0) {
        document.getElementById('avgMult').textContent = '-';
        document.getElementById('rtp').textContent = '-';
        document.getElementById('chiSq').textContent = '-';
        document.getElementById('status').textContent = 'no data';
        document.getElementById('dist').innerHTML = '<p>Play plinko to collect data</p>';
        return;
    }

    document.getElementById('avgMult').textContent = stats.avgMult.toFixed(3) + 'x';
    document.getElementById('rtp').textContent = stats.rtp.toFixed(2) + '%';
    document.getElementById('chiSq').textContent = stats.chiSq.toFixed(2);
    document.getElementById('status').textContent = stats.fair ? '✅ FAIR' : '⚠️ CHECK';
    document.getElementById('status').style.color = stats.fair ? 'green' : 'red';

    const maxCount = Math.max(...stats.buckets);
    let distHtml = '<table style="width:100%">';
    for (let i = 0; i <= stats.pins; i++) {
        const pct = (stats.buckets[i] / stats.count * 100).toFixed(1);
        const barWidth = maxCount > 0 ? (stats.buckets[i] / maxCount * 100) : 0;
        distHtml += `<tr><td>${i}</td><td>${stats.buckets[i]}</td><td><div class="bar" style="width:${barWidth}%"></div></td><td>${pct}%</td></tr>`;
    }
    document.getElementById('dist').innerHTML = distHtml + '</table>';
}

async function getResults() {
    // try extension storage first
    return new Promise((resolve) => {
        chrome.storage.local.get(['results'], (data) => {
            if (data.results?.length > 0) {
                resolve(data.results);
            } else {
                // try to get from page localStorage
                chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                    if (!tabs[0]?.id) return resolve([]);
                    try {
                        const results = await chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id, allFrames: true },
                            func: () => {
                                try {
                                    return JSON.parse(localStorage.getItem('plinkoResults') || '[]');
                                } catch { return []; }
                            }
                        });
                        // merge results from all frames
                        const all = results.flatMap(r => r.result || []);
                        const unique = [...new Map(all.map(x => [x.id, x])).values()];
                        resolve(unique);
                    } catch { resolve([]); }
                });
            }
        });
    });
}

async function refresh() {
    const results = await getResults();
    updateUI(analyze(results));
}

document.getElementById('exportBtn').addEventListener('click', async () => {
    const results = await getResults();
    const stats = analyze(results);

    const blob = new Blob([JSON.stringify({
        results,
        summary: { count: stats.count, avgMult: stats.avgMult, rtp: stats.rtp, chiSq: stats.chiSq, fair: stats.fair, buckets: stats.buckets },
        exported: new Date().toISOString()
    }, null, 2)], { type: 'application/json' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plinko_${Date.now()}.json`;
    a.click();
});

document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm('Clear all data?')) return;

    chrome.storage.local.set({ results: [] });

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id, allFrames: true },
                    func: () => localStorage.removeItem('plinkoResults')
                });
            } catch {}
        }
        refresh();
    });
});

refresh();
