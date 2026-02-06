// content script - runs on winna pages and iframes
// captures API responses for verification

(function() {
    const origFetch = window.fetch;

    window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);

        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

            if (url.includes('/plinko/play')) {
                const clone = res.clone();
                const data = await clone.json();

                if (data.data && typeof data.data.bucket !== 'undefined') {
                    // capture full API response
                    saveResult({
                        bucket: data.data.bucket,
                        mult: data.multiplier,
                        difficulty: data.data.difficulty,
                        pins: data.data.pins,
                        id: data.id,
                        nonce: data.nonce ?? data.data?.nonce ?? null,
                        serverSeedHash: data.serverSeedHash ?? data.server_seed_hash ?? data.data?.serverSeedHash ?? null,
                        clientSeed: data.clientSeed ?? data.client_seed ?? data.data?.clientSeed ?? null,
                        // save full response for debug
                        _raw: data,
                        ts: Date.now()
                    });
                }
            }
        } catch (e) {}

        return res;
    };

    // also intercept XMLHttpRequest
    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return origXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (this._url && this._url.includes('/plinko/play')) {
            this.addEventListener('load', function() {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.data && typeof data.data.bucket !== 'undefined') {
                        saveResult({
                            bucket: data.data.bucket,
                            mult: data.multiplier,
                            difficulty: data.data.difficulty,
                            pins: data.data.pins,
                            id: data.id,
                            nonce: data.nonce ?? data.data?.nonce ?? null,
                            serverSeedHash: data.serverSeedHash ?? data.server_seed_hash ?? data.data?.serverSeedHash ?? null,
                            clientSeed: data.clientSeed ?? data.client_seed ?? data.data?.clientSeed ?? null,
                            _raw: data,
                            ts: Date.now()
                        });
                    }
                } catch(e) {}
            });
        }
        return origXHRSend.apply(this, args);
    };

    function saveResult(result) {
        let results = [];
        try {
            const saved = localStorage.getItem('plinkoResults');
            if (saved) results = JSON.parse(saved);
        } catch(e) {}

        if (results.some(r => r.id === result.id)) return;
        results.push(result);

        try {
            localStorage.setItem('plinkoResults', JSON.stringify(results));
        } catch(e) {}

        try {
            chrome.storage?.local?.set({ results });
        } catch(e) {}

        const nonceStr = result.nonce !== null ? ` n:${result.nonce}` : '';
        console.log(`[plinko #${results.length}] bucket ${result.bucket}, ${result.mult}x${nonceStr}`);
    }

    try {
        const saved = localStorage.getItem('plinkoResults');
        const count = saved ? JSON.parse(saved).length : 0;
        console.log(`[plinko tracker] active (${count} saved results)`);
    } catch(e) {
        console.log('[plinko tracker] active');
    }
})();
