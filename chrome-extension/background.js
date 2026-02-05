// background service worker - intercepts network responses

chrome.webRequest.onCompleted.addListener(
    async (details) => {
        if (details.url.includes('/plinko/play') && details.method === 'POST') {
            console.log('[plinko] detected request:', details.url);

            // we can't read response body directly in MV3
            // notify any open winna tabs to check for new data
            chrome.tabs.query({ url: '*://*.winna.com/*' }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: 'plinko-request-detected' }).catch(() => {});
                });
            });
        }
    },
    { urls: ['*://originals.winna.com/*'] }
);

console.log('[plinko tracker] background worker started');
