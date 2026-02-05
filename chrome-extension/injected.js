// runs in page context - can intercept fetch

(function() {
    const origFetch = window.fetch;

    window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);

        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

            if (url && url.includes('/plinko/play')) {
                const clone = res.clone();
                const data = await clone.json();

                if (data.data && typeof data.data.bucket !== 'undefined') {
                    const result = {
                        bucket: data.data.bucket,
                        mult: data.multiplier,
                        difficulty: data.data.difficulty,
                        pins: data.data.pins,
                        id: data.id,
                        ts: Date.now()
                    };

                    // send to content script
                    window.dispatchEvent(new CustomEvent('plinko-result', { detail: result }));
                    console.log(`[plinko] bucket ${result.bucket}, ${result.mult}x`);
                }
            }
        } catch (e) {
            // ignore
        }

        return res;
    };

    console.log('[plinko tracker] fetch interceptor active');
})();
