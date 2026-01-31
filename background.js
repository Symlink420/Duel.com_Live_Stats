(function() {
    'use strict';
    const activeTabs = new Set();
    const isGameUrl = (url) => url && /^https:\/\/duel\.com\/(plinko|keno)(\/|\?|#|$)/.test(url);
    const CLEANUP_INTERVAL_MS = 300000;
    const TEMP_MAX_AGE_MS = 300000;

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && isGameUrl(tab.url)) activeTabs.add(tabId);
        else if (!isGameUrl(tab.url)) activeTabs.delete(tabId);
    });

    chrome.tabs.onRemoved.addListener((tabId) => activeTabs.delete(tabId));

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getActiveTab') sendResponse({ tabId: sender.tab?.id });
        else if (request.action === 'isActiveTab') sendResponse({ isActive: activeTabs.has(sender.tab?.id) });
    });

    setInterval(() => {
        chrome.storage.local.get(null, (items) => {
            const now = Date.now();
            const keysToRemove = Object.keys(items).filter(key =>
                key.startsWith('duelTemp_') && now - (items[key].timestamp || 0) > TEMP_MAX_AGE_MS
            );
            if (keysToRemove.length) chrome.storage.local.remove(keysToRemove);
        });
    }, CLEANUP_INTERVAL_MS);
})();
