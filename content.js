// Content script for Duel Live Stats extension
// Runs on https://duel.com/plinko and https://duel.com/keno

(function() {
    'use strict';

    if (!/^https:\/\/duel\.com\/(plinko|keno)(\/|\?|#|$)/.test(window.location.href)) return;

    const isKeno = /\/keno(\/|\?|#|$)/.test(window.location.pathname);

    // State management
    let isStatsWindowOpen = false;
    let statsData = {
        totalBets: 0,
        totalWagered: 0,
        totalProfit: 0,
        totalWinnings: 0,
        averageMultiplier: 0,
        wins: 0,
        losses: 0,
        recentBets: [],
        profitHistory: [], // For graph
        betHistory: [] // For graph
    };
    
    // Currency detection and formatting
    let currentCurrency = 'usd';
    const currencyMap = {
        'eur': { symbol: '€', code: 'EUR' },
        'usd': { symbol: '$', code: 'USD' },
        'cad': { symbol: 'C$', code: 'CAD' },
        'jpy': { symbol: '¥', code: 'JPY' },
        'cny': { symbol: '¥', code: 'CNY' },
        'inr': { symbol: '₹', code: 'INR' },
        'idr': { symbol: 'Rp', code: 'IDR' },
        'nzd': { symbol: 'NZ$', code: 'NZD' },
        'aud': { symbol: 'A$', code: 'AUD' },
        'dkk': { symbol: 'kr', code: 'DKK' },
        'try': { symbol: '₺', code: 'TRY' },
        'krw': { symbol: '₩', code: 'KRW' },
        'ars': { symbol: '$', code: 'ARS' },
        'brl': { symbol: 'R$', code: 'BRL' },
        'usdt': { symbol: 'USDT', code: 'USDT' },
        'usdc': { symbol: 'USDC', code: 'USDC' },
        'btc': { symbol: '₿', code: 'BTC' },
        'eth': { symbol: 'Ξ', code: 'ETH' },
        'bnb': { symbol: 'BNB', code: 'BNB' },
        'sol': { symbol: 'SOL', code: 'SOL' },
        'xrp': { symbol: 'XRP', code: 'XRP' },
        'ltc': { symbol: 'Ł', code: 'LTC' },
        'doge': { symbol: 'Ð', code: 'DOGE' },
        'trx': { symbol: 'TRX', code: 'TRX' },
        'bch': { symbol: 'BCH', code: 'BCH' },
        'ada': { symbol: 'ADA', code: 'ADA' },
        'link': { symbol: 'LINK', code: 'LINK' },
        'avax': { symbol: 'AVAX', code: 'AVAX' },
        'ton': { symbol: 'TON', code: 'TON' },
        'hbar': { symbol: 'HBAR', code: 'HBAR' }
    };
    const CURRENCY_CODES_REGEX = new RegExp('\\b(' + Object.keys(currencyMap).join('|') + ')\\s*$', 'i');
    
    // UI state
    let uiState = {
        showRecentBets: true,
        showGraph: true
    };

    // DOM elements
    let toggleButton;
    let statsWindow;
    let statsContent;

    function init() {
        if (!document.body) {
            setTimeout(init, 50);
            return;
        }
        detectCurrency();
        loadStatsFromStorage();
        createToggleButton();
        createStatsWindow();
        chrome.runtime.onMessage.addListener(handleMessage);
        // Same stats UI (button + graph/recent toggles) on both plinko and keno
        chrome.storage.onChanged.addListener(handleStorageChange);
        interceptFetchRequests();
        if (isKeno) watchForKenoResults();
        else watchForBetResults();
        scheduleButtonRetries();
    }

    function scheduleButtonRetries() {
        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(() => {
            if (document.getElementById('duel-stats-toggle')) {
                clearInterval(interval);
                return;
            }
            if (!document.body || attempts >= maxAttempts) {
                clearInterval(interval);
                return;
            }
            if (!document.getElementById('duel-stats-toggle')) {
                createToggleButton();
                if (statsWindow && !document.getElementById('duel-stats-window')) {
                    document.body.appendChild(statsWindow);
                }
            }
            attempts++;
        }, 500);
    }

    // Detect current currency from website
    function detectCurrency() {
        try {
            // Look for currency icon SVG elements
            const currencyIcons = document.querySelectorAll('svg g[clip-path*="icon-duel-"]');
            
            for (const icon of currencyIcons) {
                const clipPath = icon.getAttribute('clip-path');
                if (clipPath) {
                    // Extract currency code from clip-path URL
                    const match = clipPath.match(/icon-duel-(\w+)_svg__a/);
                    if (match) {
                        const currencyCode = match[1].toLowerCase();
                        if (currencyMap[currencyCode]) {
                            currentCurrency = currencyCode;
                            break;
                        }
                    }
                }
            }
            
            if (currentCurrency === 'usd' || !currencyMap[currentCurrency]) {
                const labelEl = document.querySelector('[data-testid="bet-input-label"]');
                if (labelEl) {
                    const m = (labelEl.textContent || '').trim().match(CURRENCY_CODES_REGEX);
                    if (m && currencyMap[m[1].toLowerCase()]) currentCurrency = m[1].toLowerCase();
                }
            }
            if (currentCurrency === 'usd' || !currencyMap[currentCurrency]) {
                const currencyElements = document.querySelectorAll('[class*="currency"], [data-currency], [data-testid*="currency"]');
                for (const element of currencyElements) {
                    const text = element.textContent || element.getAttribute('data-currency') || '';
                    const m = text.match(CURRENCY_CODES_REGEX);
                    if (m && currencyMap[m[1].toLowerCase()]) {
                        currentCurrency = m[1].toLowerCase();
                        break;
                    }
                }
            }
        } catch (_) {}
    }

    function getBetAmountAndCurrencyFromPage() {
        let amount = 0;
        const moneyEl = document.querySelector('[data-testid="money-input-amount"]');
        if (moneyEl && moneyEl.textContent) {
            const n = parseFloat(String(moneyEl.textContent).trim().replace(/,/g, ''));
            if (!isNaN(n)) amount = n;
        }
        if (amount === 0) {
            const inputEl = document.querySelector('input[data-testid="currency-input"]');
            if (inputEl && inputEl.value) {
                const n = parseFloat(String(inputEl.value).trim().replace(/,/g, ''));
                if (!isNaN(n)) amount = n;
            }
        }
        const labelEl = document.querySelector('[data-testid="bet-input-label"]');
        let currency = currentCurrency;
        if (labelEl) {
            const m = (labelEl.textContent || '').trim().match(CURRENCY_CODES_REGEX);
            if (m && currencyMap[m[1].toLowerCase()]) currency = m[1].toLowerCase();
        }
        return { amount, currency };
    }

    function formatCurrency(amount) {
        const key = (currentCurrency || 'usd').toLowerCase();
        const currency = currencyMap[key] || currencyMap['usd'];
        const symbol = currency ? currency.symbol : (key.toUpperCase());
        const formattedAmount = Math.abs(amount).toFixed(2);
        return `${symbol}${formattedAmount}`;
    }

    // Load stats from chrome storage
    async function loadStatsFromStorage() {
        try {
            const result = await chrome.storage.local.get(['duelStats']);
            if (result.duelStats) {
                statsData = { ...statsData, ...result.duelStats };
                updateStatsDisplay();
            }
        } catch (_) {}
    }

    // Save stats to chrome storage
    async function saveStatsToStorage() {
        try {
            await chrome.storage.local.set({ duelStats: statsData });
        } catch (_) {}
    }

    function createToggleButton() {
        const existing = document.getElementById('duel-stats-toggle');
        if (existing) {
            toggleButton = existing;
            return;
        }
        toggleButton = document.createElement('div');
        toggleButton.id = 'duel-stats-toggle';
        toggleButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 13h2l3.5-7 4 14 3.5-7H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        toggleButton.title = 'Toggle Live Stats';
        
        // Add click event listener
        toggleButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleStatsWindow();
        });
        
        document.body.appendChild(toggleButton);
    }

    // Create the stats window
    function createStatsWindow() {
        statsWindow = document.createElement('div');
        statsWindow.id = 'duel-stats-window';
        statsWindow.innerHTML = `
            <div class="duel-stats-header">
                <div class="duel-logo">
                    <svg xmlns="http://www.w3.org/2000/svg" width="68" height="26" fill="none" viewBox="0 0 68 26">
                        <path fill="#ffffff" d="M67.545 24.17h-5.718V.5h5.718zM60.08 16.258v.864H47.582c.266 2.36 1.463 3.524 3.59 3.524 1.463 0 2.46-.599 2.992-1.829l5.486.366c-.599 1.795-1.63 3.192-3.092 4.156-1.463.997-3.225 1.462-5.352 1.462-2.892 0-5.153-.83-6.815-2.56-1.662-1.695-2.493-3.922-2.493-6.648q0-4.04 2.493-6.583c1.596-1.662 3.79-2.526 6.516-2.526 2.858 0 5.086.93 6.748 2.76 1.596 1.828 2.427 4.155 2.427 7.014m-12.466-2.56h6.616c-.266-2.095-1.363-3.158-3.258-3.158-1.928 0-3.025 1.063-3.358 3.158M34.375 16.158V7.016h5.718V24.17h-5.386l-.166-2.294c-1.197 1.861-2.892 2.76-5.153 2.76-1.928 0-3.39-.533-4.454-1.63s-1.596-2.626-1.596-4.62V7.015h5.718v10.04c0 .864.2 1.562.598 2.027.4.466.964.699 1.729.699.864 0 1.596-.333 2.16-.998.533-.665.832-1.529.832-2.626M.024.5h9.974c3.656 0 6.482 1.03 8.41 3.058Q21.3 6.65 21.3 12.335c0 3.756-.93 6.682-2.759 8.743q-2.792 3.092-8.078 3.092H.024zm6.217 18.45h3.158c3.79 0 5.685-2.194 5.685-6.615 0-2.26-.499-3.956-1.463-5.053S11.128 5.62 9.067 5.62H6.24z"></path>
                    </svg>
                </div>
                <div class="duel-stats-controls">
                    <button id="duel-stats-reset" title="Reset Stats">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                            <path d="M21 3v5h-5"/>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                            <path d="M3 21v-5h5"/>
                        </svg>
                    </button>
                    <button id="duel-stats-close" title="Close">×</button>
                </div>
            </div>
            <div class="duel-stats-content" id="duel-stats-content">
                <div class="duel-stats-loading">Loading stats...</div>
            </div>
            <div class="duel-stats-toggles">
                <div class="duel-toggle-group">
                    <button id="toggle-graph" class="duel-toggle-btn active">📊 Graph</button>
                    <button id="toggle-recent" class="duel-toggle-btn active">📋 Recent</button>
                </div>
            </div>
            <div class="duel-stats-credit">by symlink</div>
        `;

        // Add event listeners after DOM is updated
        setTimeout(() => {
            const resetButton = document.getElementById('duel-stats-reset');
            const closeButton = document.getElementById('duel-stats-close');
            const toggleGraph = document.getElementById('toggle-graph');
            const toggleRecent = document.getElementById('toggle-recent');
            
            if (resetButton) {
                resetButton.addEventListener('click', resetStats);
            }
            
            if (closeButton) {
                closeButton.addEventListener('click', closeStatsWindow);
            }
            
            if (toggleGraph) {
                toggleGraph.addEventListener('click', () => toggleFeature('showGraph', toggleGraph));
            }
            
            if (toggleRecent) {
                toggleRecent.addEventListener('click', () => toggleFeature('showRecentBets', toggleRecent));
            }
        }, 100);

        const header = statsWindow.querySelector('.duel-stats-header');
        if (header) makeDraggable(statsWindow, header);

        // Initially hidden
        statsWindow.style.display = 'none';
        document.body.appendChild(statsWindow);
    }

    // Toggle stats window visibility
    function toggleStatsWindow() {
        if (isStatsWindowOpen) {
            closeStatsWindow();
        } else {
            openStatsWindow();
        }
    }

    // Open stats window
    function openStatsWindow() {
        statsWindow.style.display = 'block';
        isStatsWindowOpen = true;
        updateStatsDisplay();
        positionStatsWindow();
    }

    // Close stats window
    function closeStatsWindow() {
        statsWindow.style.display = 'none';
        isStatsWindowOpen = false;
    }

    // Position stats window near toggle button
    function positionStatsWindow() {
        const buttonRect = toggleButton.getBoundingClientRect();
        const windowRect = statsWindow.getBoundingClientRect();
        
        // Position above and to the left of the button
        statsWindow.style.left = `${buttonRect.left - windowRect.width - 10}px`;
        statsWindow.style.top = `${buttonRect.top - windowRect.height - 10}px`;
    }

    // Make element draggable
    function makeDraggable(element, handle) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(window.getComputedStyle(element).left, 10);
            startTop = parseInt(window.getComputedStyle(element).top, 10);
            
            handle.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = `${startLeft + deltaX}px`;
            element.style.top = `${startTop + deltaY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'grab';
            }
        });
    }

    // Intercept fetch requests to capture bet data
    function interceptFetchRequests() {
        // Store original fetch
        const originalFetch = window.fetch;
        
        // Override fetch
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            
            // Check if this is a bet request
            const url = args[0];
            const options = args[1] || {};
            
            // Check URL patterns for bet requests
            const isBetRequest = typeof url === 'string' && (
                url.includes('bet') || 
                url.includes('plinko') || 
                url.includes('game') ||
                url.includes('api') ||
                url.includes('duel.com')
            );
            
            // Check if request body contains bet data
            let hasBetPayload = false;
            if (options.body) {
                try {
                    const bodyText = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                    hasBetPayload = bodyText.includes('risk_level') || bodyText.includes('amount') || bodyText.includes('rows');
                } catch (e) {
                    // Ignore parsing errors
                }
            }
            
            if (isBetRequest || hasBetPayload) {
                try {
                    // Clone the response to read it without consuming it
                    const clonedResponse = response.clone();
                    const responseText = await clonedResponse.text();
                    
                    // Try to parse as JSON
                    const betData = JSON.parse(responseText);
                    
                    // Check if this is a successful bet response
                    if (betData && typeof betData === 'object' && betData.success === true && betData.data) {
                        processBetData(betData);
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            }
            
            return response;
        };
        
        // Also intercept XMLHttpRequest as backup
        interceptXHRRequests();
    }
    
    // Intercept XMLHttpRequest as backup method
    function interceptXHRRequests() {
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._url = url;
            this._method = method;
            return originalXHROpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
            const xhr = this;
            
            // Add response handler
            xhr.addEventListener('readystatechange', function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        const responseText = xhr.responseText;
                        const betData = JSON.parse(responseText);
                        if (betData && typeof betData === 'object' && betData.success === true && betData.data) {
                            processBetData(betData);
                        }
                    } catch (error) {
                        // Not JSON or not a bet response, ignore
                    }
                }
            });
            
            return originalXHRSend.apply(this, [data]);
        };
    }
    
    function watchForBetResults() {
        const processedResults = new Set();
        const PLINKO_SELECTORS = '[data-testid^="plinko-drop-result-"], [data-testid^="plinko-result-"]';

        function processAllResults() {
            const resultElements = document.querySelectorAll(PLINKO_SELECTORS);
            resultElements.forEach((element) => {
                const resultId = element.getAttribute('data-testid');
                if (!resultId || processedResults.has(resultId)) return;
                const multiplierText = (element.textContent || '').trim().replace(/^x\s*/i, '');
                const multiplier = parseFloat(multiplierText.replace(/,/g, ''));
                if (isNaN(multiplier)) return;
                const { amount: betAmount, currency: betCurrency } = getBetAmountAndCurrencyFromPage();
                if (betCurrency !== currentCurrency) currentCurrency = betCurrency;
                let riskLevel = 'high';
                const riskButton = document.querySelector('[data-testid*="risk"], .risk-level, [class*="risk"]');
                if (riskButton) {
                    const riskText = riskButton.textContent.toLowerCase();
                    if (riskText.includes('low')) riskLevel = 'low';
                    else if (riskText.includes('medium')) riskLevel = 'medium';
                }
                const winAmount = betAmount * multiplier;
                const profit = winAmount - betAmount;
                const id = resultId.replace(/^plinko-(?:drop-)?result-/, '');
                const mockBetData = {
                    success: true,
                    data: {
                        id,
                        payout_multiplier: multiplier.toString(),
                        amount_currency: betAmount.toString(),
                        win_amount: winAmount.toString(),
                        profit: profit.toString(),
                        risk_level: riskLevel,
                        rows: 16,
                        final_slot: 0
                    }
                };
                processBetData(mockBetData);
                processedResults.add(resultId);
            });
        }

        const observer = new MutationObserver((mutations) => {
            const hasResultChanges = mutations.some((m) => {
                if (m.type !== 'childList' || !m.addedNodes.length) return false;
                return Array.from(m.addedNodes).some((node) =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches && node.matches(PLINKO_SELECTORS) ||
                     (node.querySelector && node.querySelector(PLINKO_SELECTORS)))
                );
            });
            if (hasResultChanges) setTimeout(processAllResults, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(processAllResults, 800);
        setInterval(processAllResults, 2000);
        setInterval(detectCurrency, 5000);
    }

    function watchForKenoResults() {
        const processedResults = new Set();

        function processAllKenoResults() {
            const resultElements = document.querySelectorAll('[data-testid^="keno-result-"]');
            resultElements.forEach((element) => {
                const resultId = element.getAttribute('data-testid');
                if (!resultId || processedResults.has(resultId)) return;
                const multiplierText = (element.textContent || '').trim();
                const multiplier = parseFloat(multiplierText.replace(/,/g, ''));
                if (isNaN(multiplier)) return;
                const { amount: betAmount, currency: betCurrency } = getBetAmountAndCurrencyFromPage();
                if (betCurrency !== currentCurrency) currentCurrency = betCurrency;
                const winAmount = betAmount * multiplier;
                const profit = winAmount - betAmount;
                const mockBetData = {
                    success: true,
                    data: {
                        id: resultId.replace('keno-result-', ''),
                        payout_multiplier: multiplier.toString(),
                        amount_currency: betAmount.toString(),
                        win_amount: winAmount.toString(),
                        profit: profit.toString(),
                        risk_level: 'keno',
                        rows: 0,
                        final_slot: 0
                    }
                };
                processBetData(mockBetData);
                processedResults.add(resultId);
            });
        }

        const observer = new MutationObserver((mutations) => {
            const hasResultChanges = mutations.some((m) => {
                if (m.type !== 'childList' || !m.addedNodes.length) return false;
                return Array.from(m.addedNodes).some((node) =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches && node.matches('[data-testid^="keno-result-"]') ||
                     (node.querySelector && node.querySelector('[data-testid^="keno-result-"]')))
                );
            });
            if (hasResultChanges) setTimeout(processAllKenoResults, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(processAllKenoResults, 1000);
        setInterval(processAllKenoResults, 2000);
        setInterval(detectCurrency, 5000);
    }

    // Handle messages from background script
    function handleMessage(request, sender, sendResponse) {
        if (request.action === 'betData') {
            processBetData(request.data);
        }
    }

    // Handle storage changes
    function handleStorageChange(changes, namespace) {
        if (namespace === 'local' && changes.duelStats) {
            statsData = { ...statsData, ...changes.duelStats.newValue };
            if (isStatsWindowOpen) {
                updateStatsDisplay();
            }
        }
    }

    // Toggle feature visibility
    function toggleFeature(feature, button) {
        uiState[feature] = !uiState[feature];
        button.classList.toggle('active', uiState[feature]);
        updateStatsDisplay();
    }

    // Process bet data from background script
    function processBetData(betData) {
        if (!betData || !betData.success || !betData.data) {
            return;
        }

        const data = betData.data;
        
        // Update stats
        statsData.totalBets++;
        statsData.totalWagered += parseFloat(data.amount_currency) || 0;
        statsData.totalProfit += parseFloat(data.profit) || 0;
        statsData.totalWinnings += parseFloat(data.win_amount) || 0;
        
        // Update average multiplier
        const multiplier = parseFloat(data.payout_multiplier) || 0;
        statsData.averageMultiplier = ((statsData.averageMultiplier * (statsData.totalBets - 1)) + multiplier) / statsData.totalBets;
        
        
        // Update wins/losses based on multiplier
        if (multiplier >= 1.0) {
            statsData.wins = (statsData.wins || 0) + 1;
        } else {
            statsData.losses = (statsData.losses || 0) + 1;
        }
        
        // Add to recent bets (keep last 10)
        statsData.recentBets.unshift({
            amount: parseFloat(data.amount_currency) || 0,
            profit: parseFloat(data.profit) || 0,
            multiplier: multiplier,
            riskLevel: data.risk_level || 'unknown',
            rows: data.rows || 0,
            finalSlot: data.final_slot || 0,
            timestamp: new Date().toLocaleTimeString()
        });
        
        if (statsData.recentBets.length > 10) {
            statsData.recentBets.pop();
        }
        
        // Add to graph data (keep full session)
        statsData.profitHistory.push({
            x: statsData.totalBets,
            y: statsData.totalProfit,
            time: new Date().toLocaleTimeString()
        });
        
        statsData.betHistory.push({
            x: statsData.totalBets,
            y: parseFloat(data.amount_currency) || 0,
            time: new Date().toLocaleTimeString()
        });
        
        // Save to storage
        saveStatsToStorage();
        
        // Update display if window is open
        if (isStatsWindowOpen) {
            updateStatsDisplay();
        }
    }

    // Update the stats display
    function updateStatsDisplay() {
        const content = document.getElementById('duel-stats-content');
        if (!content) return;

        const profitColor = statsData.totalProfit >= 0 ? '#4ade80' : '#f87171';
        const profitSign = statsData.totalProfit >= 0 ? '+' : '';

        let html = `
            <div class="duel-stats-summary">
                <div class="duel-stat-item">
                    <span class="duel-stat-label">Profit</span>
                    <span class="duel-stat-value ${statsData.totalProfit >= 0 ? 'positive' : 'negative'}">${profitSign}${formatCurrency(statsData.totalProfit)}</span>
                </div>
                <div class="duel-stat-item">
                    <span class="duel-stat-label">Wagered</span>
                    <span class="duel-stat-value">${formatCurrency(statsData.totalWagered)}</span>
                </div>
                <div class="duel-stat-item">
                    <span class="duel-stat-label">Wins</span>
                    <span class="duel-stat-value positive">${statsData.wins || 0}</span>
                </div>
                <div class="duel-stat-item">
                    <span class="duel-stat-label">Losses</span>
                    <span class="duel-stat-value negative">${statsData.losses || 0}</span>
                </div>
            </div>
        `;

        // Add graph if enabled
        if (uiState.showGraph) {
            html += `
                <div class="duel-stats-graph">
                    <h4>Profit Trend</h4>
                    <div class="duel-graph-container">
                        <canvas id="duel-profit-chart"></canvas>
                    </div>
                </div>
            `;
        }


        // Add recent bets if enabled
        if (uiState.showRecentBets) {
            html += `
                <div class="duel-stats-recent">
                    <h4>Recent Bets</h4>
                    <div class="duel-recent-bets">
                        ${statsData.recentBets.map(bet => `
                            <div class="duel-recent-bet">
                                <div class="duel-bet-info">
                                    <span class="duel-bet-amount">${formatCurrency(bet.amount)}</span>
                                    <span class="duel-bet-multiplier">${bet.multiplier.toFixed(2)}x</span>
                                    <span class="duel-bet-risk ${bet.riskLevel}">${bet.riskLevel}</span>
                                </div>
                                <div class="duel-bet-profit ${bet.profit >= 0 ? 'positive' : 'negative'}">
                                    ${bet.profit >= 0 ? '+' : ''}${formatCurrency(bet.profit)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        content.innerHTML = html;

        // Draw graph if enabled
        if (uiState.showGraph) {
            setTimeout(() => drawProfitChart(), 100);
        }
    }

    // Draw modern profit chart inspired by top gambling sites
    function drawProfitChart() {
        const canvas = document.getElementById('duel-profit-chart');
        if (!canvas || statsData.profitHistory.length < 1) return;

        // Set up high-DPI canvas for crisp rendering
        const container = canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Calculate display dimensions
        const emToPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const displayWidth = rect.width;
        const displayHeight = 13.5 * emToPx;
        
        // Set display size (CSS size)
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        
        // Set actual canvas size (scaled for high DPI)
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Scale the drawing context to match the device pixel ratio
        ctx.scale(dpr, dpr);
        
        // Enable high-quality rendering
        ctx.textRenderingOptimization = 'optimizeQuality';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Clear canvas with transparent background
        ctx.clearRect(0, 0, width, height);
        
        // Chart dimensions with 5% padding to ensure all bets are visible
        const paddingPercent = 0.05; // 5% padding
        const margin = { 
            top: displayHeight * paddingPercent, 
            right: displayWidth * paddingPercent, 
            bottom: displayHeight * paddingPercent, 
            left: displayWidth * paddingPercent 
        };
        const chartWidth = displayWidth - margin.left - margin.right;
        const chartHeight = displayHeight - margin.top - margin.bottom;
        
        // Data processing
        const profits = statsData.profitHistory.map(d => d.y);
        const minProfit = Math.min(...profits, 0);
        const maxProfit = Math.max(...profits, 0);
        const range = maxProfit - minProfit || 1;
        const padding = range * 0.15;
        const yMin = minProfit - padding;
        const yMax = maxProfit + padding;
        const yRange = yMax - yMin;
        
        // Helper functions with margins for proper positioning
        const getX = (index) => {
            if (statsData.profitHistory.length === 1) return margin.left + chartWidth / 2;
            return margin.left + (index / Math.max(statsData.profitHistory.length - 1, 1)) * chartWidth;
        };
        const getY = (value) => margin.top + ((yMax - value) / yRange) * chartHeight;
        
        // Draw modern gradient area under curve with margins
        if (statsData.profitHistory.length > 1) {
            const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
            const isPositive = statsData.totalProfit >= 0;
            gradient.addColorStop(0, isPositive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)');
            gradient.addColorStop(0.5, isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)');
            gradient.addColorStop(1, isPositive ? 'rgba(34, 197, 94, 0.02)' : 'rgba(239, 68, 68, 0.02)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(getX(0), margin.top + chartHeight);
            
            statsData.profitHistory.forEach((point, index) => {
                ctx.lineTo(getX(index), getY(point.y));
            });
            
            ctx.lineTo(getX(statsData.profitHistory.length - 1), margin.top + chartHeight);
            ctx.closePath();
            ctx.fill();
        }
        
        // Draw smooth trend line using quadratic curves
        if (statsData.profitHistory.length > 1) {
            const isPositive = statsData.totalProfit >= 0;
            const gradient = ctx.createLinearGradient(margin.left, 0, margin.left + chartWidth, 0);
            gradient.addColorStop(0, isPositive ? '#22c55e' : '#ef4444');
            gradient.addColorStop(0.5, isPositive ? '#16a34a' : '#dc2626');
            gradient.addColorStop(1, isPositive ? '#15803d' : '#b91c1c');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3;
            ctx.shadowColor = isPositive ? '#22c55e' : '#ef4444';
            ctx.shadowBlur = 12;
            
            ctx.beginPath();
            
            // Start with the first point
            const firstPoint = statsData.profitHistory[0];
            ctx.moveTo(getX(0), getY(firstPoint.y));
            
            // Create smooth curves between points
            for (let i = 0; i < statsData.profitHistory.length - 1; i++) {
                const currentPoint = statsData.profitHistory[i];
                const nextPoint = statsData.profitHistory[i + 1];
                
                const currentX = getX(i);
                const currentY = getY(currentPoint.y);
                const nextX = getX(i + 1);
                const nextY = getY(nextPoint.y);
                
                // Calculate control point for smooth curve
                const controlX = (currentX + nextX) / 2;
                const controlY = (currentY + nextY) / 2;
                
                // Use quadratic curve for smooth transitions
                ctx.quadraticCurveTo(controlX, controlY, nextX, nextY);
            }
            
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        // Draw subtle data points (only for recent points)
        const isPositive = statsData.totalProfit >= 0;
        const recentPointsCount = Math.min(5, statsData.profitHistory.length); // Only show last 5 points
        
        statsData.profitHistory.slice(-recentPointsCount).forEach((point, index) => {
            const actualIndex = statsData.profitHistory.length - recentPointsCount + index;
            const x = getX(actualIndex);
            const y = getY(point.y);
            
            // Subtle glowing dot
            ctx.shadowColor = isPositive ? '#22c55e' : '#ef4444';
            ctx.shadowBlur = 8;
            ctx.fillStyle = isPositive ? '#22c55e' : '#ef4444';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
            
            // Inner highlight
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Add modern tooltip functionality (only add listeners once)
        if (!canvas.tooltipAdded) {
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Find closest data point with improved hover detection
                let closestIndex = -1;
                let minDistance = Infinity;
                
                statsData.profitHistory.forEach((point, index) => {
                    const pointX = getX(index);
                    const pointY = getY(point.y);
                    
                    // Use larger hover area for better interaction
                    const hoverRadius = 40; // Increased from 30px
                    const distance = Math.sqrt((x - pointX) ** 2 + (y - pointY) ** 2);
                    
                    if (distance < minDistance && distance < hoverRadius) {
                        minDistance = distance;
                        closestIndex = index;
                    }
                });
                
                // Also check for horizontal proximity to make it easier to hover over last points
                if (closestIndex === -1 && statsData.profitHistory.length > 0) {
                    const lastIndex = statsData.profitHistory.length - 1;
                    const lastX = getX(lastIndex);
                    const lastY = getY(statsData.profitHistory[lastIndex].y);
                    
                    // If mouse is near the last point horizontally, select it
                    if (Math.abs(x - lastX) < 50 && Math.abs(y - lastY) < 60) {
                        closestIndex = lastIndex;
                    }
                }
                
                // Update cursor style
                canvas.style.cursor = closestIndex !== -1 ? 'pointer' : 'default';
                
                // Store hover state for rendering
                canvas.hoveredIndex = closestIndex;
                
                // Redraw chart with hover effects
                drawProfitChart();
            });
            
            canvas.addEventListener('mouseleave', () => {
                canvas.hoveredIndex = -1;
                drawProfitChart();
            });
            
            canvas.tooltipAdded = true;
        }
        
        // Draw hover tooltip
        if (canvas.hoveredIndex !== -1 && canvas.hoveredIndex < statsData.profitHistory.length) {
            const point = statsData.profitHistory[canvas.hoveredIndex];
            const x = getX(canvas.hoveredIndex);
            const y = getY(point.y);
            
            // Tooltip background
            const tooltipWidth = 120;
            const tooltipHeight = 60;
            const tooltipX = Math.min(x, displayWidth - tooltipWidth - 10);
            const tooltipY = Math.max(y - tooltipHeight - 10, 10);
            
            // Glass morphism tooltip (match app's blue theme)
            ctx.fillStyle = 'rgba(31, 81, 255, 0.9)';
            ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            
            // Tooltip border (match app's blue border)
            ctx.strokeStyle = 'rgb(15, 82, 186)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            
            // Tooltip text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const profitText = `${point.y >= 0 ? '+' : ''}${formatCurrency(point.y)}`;
            const betText = `Bet #${point.x}`;
            
            ctx.fillText(profitText, tooltipX + tooltipWidth/2, tooltipY + 20);
            ctx.fillText(betText, tooltipX + tooltipWidth/2, tooltipY + 40);
            
            // Highlight the hovered point
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 20;
            ctx.fillStyle = isPositive ? '#22c55e' : '#ef4444';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        
    }

    // Reset all stats
    function resetStats() {
        if (confirm('Are you sure you want to reset all stats? This action cannot be undone.')) {
            statsData = {
                totalBets: 0,
                totalWagered: 0,
                totalProfit: 0,
                totalWinnings: 0,
                averageMultiplier: 0,
                wins: 0,
                losses: 0,
                recentBets: [],
                profitHistory: [],
                betHistory: []
            };
            
            saveStatsToStorage();
            updateStatsDisplay();
        }
    }

    // Initialize when DOM is ready
    function safeInit() {
        try {
            init();
        } catch (_) {
            setTimeout(() => { try { init(); } catch (_) {} }, 1000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safeInit);
    } else {
        safeInit();
    }

    setTimeout(() => {
        if (!document.getElementById('duel-stats-toggle')) safeInit();
    }, 2000);

    // Handle window resize to reposition stats window
    window.addEventListener('resize', () => {
        if (isStatsWindowOpen) {
            positionStatsWindow();
        }
    });

})();
