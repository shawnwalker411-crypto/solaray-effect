/* SolaRayEffect.com mining profitability calculator (moved out of index.html).
   Loaded right after /data/generated/miners.js, which supplies window.SRE_MINERS. */
    // ============================================
    // MINER DATABASE
    // Built at deploy from data/master/miners.csv (build/generate.mjs).
    // To add, fix or remove a miner, edit the master list - not this page.
    // ============================================
    const MINERS_120V = (window.SRE_MINERS || []).filter(m => m.voltage === '120V');
    const MINERS_240V = (window.SRE_MINERS || []).filter(m => m.voltage === '240V');
    
    // Combined for "All" filter and browse table
    const ALL_MINERS = [...MINERS_120V, ...MINERS_240V];
    
    // Prices & Rates - Updated via CoinGecko API, these are fallback defaults
    const DEFAULT_PRICES = { 
      BTC: 0, BCH: 0, LTC: 0, KAS: 0, ETC: 0, DOGE: 0,
      ZEC: 0, DASH: 0, DGB: 0,
      XEC: 0, ALPH: 0, FB: 0, QUAI: 0, BSV: 0
    };
    let PRICES = { ...DEFAULT_PRICES };
    let priceStatus = 'default'; // 'live', 'cached', 'default'
    let lastPriceUpdate = null;
    
    // Revenue rates per unit per day (coins earned)
    // These are DEFAULT values - will be updated with live data from API
    // Sources: CoinWarz, MinerStat, WhatToMine (fallback defaults)
    let REVENUE_RATES = {
      // ASIC Algorithms
      'SHA-256': { perUnit: 0.00000043, unit: 'TH/s', coin: 'BTC' },
      'SHA-256-BCH': { perUnit: 0.0000778, unit: 'TH/s', coin: 'BCH' },
      'Scrypt': { 
        perUnit: 0.00000122, unit: 'MH/s', coin: 'LTC',
        merged: { perUnit: 0.00532, coin: 'DOGE' }
      },
      'KHeavyHash': { perUnit: 0.00646, unit: 'GH/s', coin: 'KAS' },
      'Etchash': { perUnit: 0.0000663, unit: 'MH/s', coin: 'ETC' },
      'Equihash': { perUnit: 0.000095, unit: 'kSol/s', coin: 'ZEC' },
      'X11': { perUnit: 0.0000677, unit: 'GH/s', coin: 'DASH' },
      // DGB
      'SHA-256-DGB': { perUnit: 8.52, unit: 'TH/s', coin: 'DGB' },
      // XEC &mdash; SHA-256, ~51 PH/s network, 1,812,500 XEC/block post-halving, 600s blocks, live ~5,118 XEC/TH/day (refreshed 2026-04-20)
      'SHA-256-XEC': { perUnit: 5118, unit: 'TH/s', coin: 'XEC' },
      // ALPH &mdash; Blake3 ASIC, network ~7.67 PH/s, reward 0.143 ALPH/block, 0.5336s block time (refreshed 2026-04-20)
      'Blake3': { perUnit: 0.003017, unit: 'GH/s', coin: 'ALPH' },
      // FB &mdash; SHA-256 standalone, live ~0.0694 FB/TH/day (refreshed 2026-04-20 post-calibration)
      'SHA-256-FB': { perUnit: 0.0816, unit: 'TH/s', coin: 'FB' },
      // QUAI-SHA &mdash; SHA-256 zone, ~5 QUAI/block, ~1.3s block time, live ~1.205 QUAI/TH/day (refreshed 2026-04-20)
      'SHA-256-QUAI': { perUnit: 1.205, unit: 'TH/s', coin: 'QUAI' },
      // QUAI-Scrypt &mdash; Scrypt zone, separate chain from SHA zone, live ~0.02033 QUAI/MH/day (refreshed 2026-04-20)
      'Scrypt-QUAI': { perUnit: 0.02033, unit: 'MH/s', coin: 'QUAI' },
      // BSV &mdash; SHA-256, 3.125 BSV/block since April 2024 halving, 600s blocks, live ~0.00202 BSV/TH/day (WhatsOnChain 2026-10-07)
      'SHA-256-BSV': { perUnit: 0.00202, unit: 'TH/s', coin: 'BSV' }
    };
    
    // Mining stats status
    let miningStatsStatus = 'default'; // 'live', 'cached', 'default'
    let lastMiningStatsUpdate = null;
    let rawMiningStats = {}; // Store raw API data for display
    
    // Algorithm configurations by mining type
    const ALGORITHM_CONFIG = {
      ASIC: [
        { value: 'all', label: 'All Algorithms' },
        { value: 'SHA-256', label: 'SHA-256 (BTC)' },
        { value: 'SHA-256-BCH', label: 'SHA-256 (BCH)' },
        { value: 'SHA-256-BSV', label: 'SHA-256 (BSV)' },
        { value: 'Scrypt', label: 'Scrypt (LTC+DOGE)' },
        { value: 'KHeavyHash', label: 'KHeavyHash (KAS)' },
        { value: 'Etchash', label: 'Etchash (ETC)' },
        { value: 'Equihash', label: 'Equihash (ZEC)' },
        { value: 'X11', label: 'X11 (DASH)' },
        { value: 'SHA-256-DGB', label: 'SHA-256 (DGB)' },
        { value: 'SHA-256-XEC', label: 'SHA-256 (XEC)' },
        { value: 'Blake3', label: 'Blake3 (ALPH)' },
        { value: 'SHA-256-FB', label: 'SHA-256 (FB)' },
        { value: 'SHA-256-QUAI', label: 'SHA-256 (QUAI)' },
        { value: 'Scrypt-QUAI', label: 'Scrypt (QUAI)' }
      ]
    };
    
    // State
    let selectedMiner = null;
    let sortDirection = 1;
    let lastCalculatedAlgorithm = null;
    
    // ============================================
    // UTILITIES
    // ============================================
    function getDailyCost(power) {
      return (power / 1000) * 24 * 0.15;
    }
    
    function getNoiseIcon(noise) {
      const icons = { silent: '\u{1F507}', fan: '\u{1F508}', vacuum: '\u{1F509}', lawnmower: '\u{1F50A}' };
      return icons[noise] || '\u{1F508}';
    }
    
    // Format large numbers with appropriate suffix
    function formatHashrate(value) {
      if (value === 0 || !value) return '0 H/s';
      
      const units = [
        { threshold: 1e18, suffix: 'EH/s' },
        { threshold: 1e15, suffix: 'PH/s' },
        { threshold: 1e12, suffix: 'TH/s' },
        { threshold: 1e9, suffix: 'GH/s' },
        { threshold: 1e6, suffix: 'MH/s' },
        { threshold: 1e3, suffix: 'KH/s' },
        { threshold: 1, suffix: 'H/s' }
      ];
      
      for (const unit of units) {
        if (value >= unit.threshold) {
          const formatted = (value / unit.threshold).toFixed(2);
          return formatted + ' ' + unit.suffix;
        }
      }
      return value.toFixed(2) + ' H/s';
    }
    
    function formatDifficulty(value) {
      if (value === 0 || !value) return '0';
      
      const units = [
        { threshold: 1e18, suffix: 'E' },
        { threshold: 1e15, suffix: 'P' },
        { threshold: 1e12, suffix: 'T' },
        { threshold: 1e9, suffix: 'B' },
        { threshold: 1e6, suffix: 'M' },
        { threshold: 1e3, suffix: 'K' },
        { threshold: 1, suffix: '' }
      ];
      
      for (const unit of units) {
        if (value >= unit.threshold) {
          const formatted = (value / unit.threshold).toFixed(2);
          return formatted + unit.suffix;
        }
      }
      return value.toFixed(2);
    }
    
    function formatBlockHeight(value) {
      if (!value) return '0';
      return value.toLocaleString();
    }
    
    // ============================================
    // LIVE PRICE FETCHING (CoinGecko API)
    // ============================================
    const COINGECKO_IDS = {
      BTC: 'bitcoin',
      BCH: 'bitcoin-cash',
      LTC: 'litecoin',
      KAS: 'kaspa',
      ETC: 'ethereum-classic',
      DOGE: 'dogecoin',
      ZEC: 'zcash',
      DASH: 'dash',
      DGB: 'digibyte',
      XEC: 'ecash',
      ALPH: 'alephium',
      FB: 'fractal-bitcoin',
      QUAI: 'quai-network',
      BSV: 'bitcoin-cash-sv'
    };
    
    async function fetchPrices() {
      const ids = Object.values(COINGECKO_IDS).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('API request failed');
        
        const data = await response.json();
        
        // Map CoinGecko response to our PRICES object
        PRICES.BTC = data.bitcoin?.usd || PRICES.BTC;
        PRICES.BCH = data['bitcoin-cash']?.usd || PRICES.BCH;
        PRICES.LTC = data.litecoin?.usd || PRICES.LTC;
        PRICES.KAS = data.kaspa?.usd || PRICES.KAS;
        PRICES.ETC = data['ethereum-classic']?.usd || PRICES.ETC;
        PRICES.DOGE = data.dogecoin?.usd || PRICES.DOGE;
        PRICES.ZEC = data.zcash?.usd || PRICES.ZEC;
        PRICES.DASH = data.dash?.usd || PRICES.DASH;
        PRICES.DGB = data.digibyte?.usd || PRICES.DGB;
        PRICES.XEC = data['ecash']?.usd || PRICES.XEC;
        PRICES.ALPH = data['alephium']?.usd || PRICES.ALPH;
        PRICES.FB = data['fractal-bitcoin']?.usd || PRICES.FB;
        PRICES.QUAI = data['quai-network']?.usd || PRICES.QUAI;
        PRICES.BSV = data['bitcoin-cash-sv']?.usd || PRICES.BSV;
        
        // Save to localStorage with timestamp
        const cacheData = {
          prices: { ...PRICES },
          timestamp: Date.now()
        };
        localStorage.setItem('solaray_prices', JSON.stringify(cacheData));
        
        priceStatus = 'live';
        lastPriceUpdate = new Date();
        updatePriceIndicator();
        hidePriceBanner();
        
        // Refresh Hot Pick and ticker with new prices
        if (typeof updateSunrisePick === 'function') updateSunrisePick();
        if (typeof updateTicker === 'function') updateTicker();
        
        console.log('Live prices fetched:', PRICES);
        return true;
      } catch (error) {
        console.warn('Failed to fetch live prices:', error);
        return false;
      }
    }
    
    function loadCachedPrices() {
      try {
        const cached = localStorage.getItem('solaray_prices');
        if (cached) {
          const data = JSON.parse(cached);
          PRICES = { ...data.prices };
          lastPriceUpdate = new Date(data.timestamp);
          priceStatus = 'cached';
          updatePriceIndicator();
          hidePriceBanner();
          if (typeof updateSunrisePick === 'function') updateSunrisePick();
          if (typeof updateTicker === 'function') updateTicker();
          console.log('Loaded cached prices from:', lastPriceUpdate);
          return true;
        }
      } catch (error) {
        console.warn('Failed to load cached prices:', error);
      }
      return false;
    }
    
    function updatePriceIndicator() {
      const indicator = document.getElementById('price-indicator');
      if (!indicator) return;
      
      if (priceStatus === 'live') {
        indicator.innerHTML = '\u{1F7E2} Live Prices';
        indicator.className = 'price-indicator live';
      } else if (priceStatus === 'cached') {
        const ago = getTimeAgo(lastPriceUpdate);
        indicator.innerHTML = `\u{1F7E1} Cached (${ago})`;
        indicator.className = 'price-indicator cached';
      } else {
        indicator.innerHTML = '\u{1F534} Prices Unavailable';
        indicator.className = 'price-indicator default';
      }
      
      // Also update the live price display if visible
      if (typeof updateLivePriceDisplay === 'function') {
        updateLivePriceDisplay();
      }
      
      // Refresh the shared data-age badge
      updateDataAgeBadge();
    }
    
    // ============================================
    // DATA AGE BADGE
    // Shared indicator that tracks the older of the two live feeds
    // (mining-stats and CoinGecko prices). Thresholds:
    //   < 2 min      -> fresh
    //   2-15 min     -> mild warning
    //   15-60 min    -> stale (stronger warning)
    //   60-360 min   -> very stale (try refresh)
    //   >= 360 min   -> dead (live info not available)
    // ============================================
    function updateDataAgeBadge() {
      const badge = document.getElementById('data-age-badge');
      if (!badge) return;
      
      // Collect feed ages in minutes. null entries mean "never fetched yet".
      const now = Date.now();
      const feedTimes = [
        lastPriceUpdate ? lastPriceUpdate.getTime() : null,
        lastMiningStatsUpdate ? lastMiningStatsUpdate.getTime() : null
      ];
      
      // If neither feed has ever succeeded, show dead state.
      const validTimes = feedTimes.filter(t => t !== null);
      if (validTimes.length === 0) {
        badge.className = 'price-indicator age-dead';
        badge.innerHTML = '\u231B Awaiting data';
        return;
      }
      
      // Use the OLDEST successful fetch -- the badge is honest about the stalest feed.
      const oldestTime = Math.min.apply(null, validTimes);
      const ageMin = Math.floor((now - oldestTime) / 60000);
      
      let stateClass, html;
      if (ageMin < 2) {
        stateClass = 'age-fresh';
        html = '\u2713 Live';
      } else if (ageMin < 15) {
        stateClass = 'age-mild';
        html = '\u26A0 ' + ageMin + 'm old';
      } else if (ageMin < 60) {
        stateClass = 'age-stale';
        html = '\u26A0 ' + ageMin + 'm old';
      } else if (ageMin < 360) {
        stateClass = 'age-very-stale';
        html = '\u26A0 Try refresh';
      } else {
        stateClass = 'age-dead';
        html = 'Live Info Not Available';
      }
      
      badge.className = 'price-indicator ' + stateClass;
      badge.innerHTML = html;
    }
    
    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }
    
    function showPriceBanner() {
      if (document.getElementById('price-banner')) return;
      const target = document.getElementById('sunrise-pick');
      if (!target) return;
      const banner = document.createElement('div');
      banner.id = 'price-banner';
      banner.style.cssText = 'text-align:center;padding:1.5rem 1rem;margin:1rem auto;max-width:900px;background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.25);border-radius:8px;';
      banner.innerHTML = '<p style="color:var(--sola-gold);font-size:1.1rem;margin-bottom:0.75rem;">'
        + '\u26A0\uFE0F Live prices temporarily unavailable</p>'
        + '<p style="color:#8899a8;margin-bottom:1rem;">'
        + 'Revenue shows $0.00 because we could not reach pricing servers. '
        + 'Explore the site while we reconnect:</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;">'
        + '<a href="miners.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F527} Miner Catalog</a>'
        + '<a href="datavault.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F4CA} Data Vault</a>'
        + '<a href="glossary.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F9E0} Glossary</a>'
        + '<a href="electrical_setup.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F50C} Electrical Setup</a>'
        + '</div>';
      target.parentNode.insertBefore(banner, target.nextSibling);
    }
    
    function hidePriceBanner() {
      const banner = document.getElementById('price-banner');
      if (banner) banner.remove();
      const calcBanner = document.getElementById('price-unavailable-msg');
      if (calcBanner) calcBanner.remove();
    }
    
    async function initPrices() {
      // Try to fetch live prices first
      const liveSuccess = await fetchPrices();
      
      // If live fetch failed, try to load from cache
      if (!liveSuccess) {
        const cacheLoaded = loadCachedPrices();
        if (!cacheLoaded) {
          // Use defaults (already set)
          priceStatus = 'default';
          updatePriceIndicator();
          showPriceBanner();
        }
      }
      
      // Set up auto-refresh every 60 seconds
      setInterval(fetchPrices, 60000);
    }
    
    // ============================================
    // LIVE MINING STATS FETCHING (SolaRay API)
    // ============================================
    async function fetchMiningStats() {
      try {
        const response = await fetch('/api/mining-stats');
        if (!response.ok) throw new Error('Mining stats API request failed');
        
        const result = await response.json();
        if (!result.success) throw new Error('Mining stats API returned error');
        
        const data = result.data;
        
        // Server-cached prices: if CoinGecko direct failed, use them for every
        // coin; if CoinGecko answered but left a coin out, fill just that coin.
        // The server names Quai 'QUAI-SHA' / 'QUAI-SCRYPT'; the calculator uses 'QUAI'.
        if (result.prices) {
          const apiPrices = result.prices;
          let loaded = false;
          for (const [key, price] of Object.entries(apiPrices)) {
            const symbol = key.startsWith('QUAI') ? 'QUAI' : key;
            if (price && price > 0 && (priceStatus !== 'live' || !(PRICES[symbol] > 0))) {
              PRICES[symbol] = price;
              loaded = true;
            }
          }
          if (loaded && priceStatus === 'live') {
            if (typeof updateSunrisePick === 'function') updateSunrisePick();
            if (typeof updateTicker === 'function') updateTicker();
          }
          if (loaded && priceStatus !== 'live') {
            priceStatus = 'cached';
            lastPriceUpdate = new Date();
            updatePriceIndicator();
            hidePriceBanner();
            if (typeof updateSunrisePick === 'function') updateSunrisePick();
            if (typeof updateTicker === 'function') updateTicker();
            console.log('Loaded server-cached prices from API:', apiPrices);
          }
        }
        
        // Store raw data for display
        rawMiningStats = data;
        
        // Update revenue rates based on live difficulty data
        updateRevenueRatesFromStats(data);
        
        // Save to localStorage with timestamp
        const cacheData = {
          stats: data,
          timestamp: Date.now()
        };
        localStorage.setItem('solaray_mining_stats', JSON.stringify(cacheData));
        
        miningStatsStatus = 'live';
        lastMiningStatsUpdate = new Date();
        updateMiningStatsIndicator();
        
        // Refresh Ember Picks with live rates
        if (typeof updateSunrisePick === 'function') updateSunrisePick();
        
        console.log('Live mining stats fetched:', data);
        return true;
      } catch (error) {
        console.warn('Failed to fetch live mining stats:', error);
        return false;
      }
    }
    
    // ============================================
    // SANITY VALIDATION FOR MINING RATES
    // These ranges are wide but will catch unit mismatches (3x-1000x errors)
    // ============================================
    const RATE_SANITY_RANGES = {
      // BTC: ~0.00000035 to ~0.0000006 BTC/TH/day historically (allows for difficulty changes)
      'SHA-256': { min: 1e-8, max: 2e-6, coin: 'BTC', unit: 'TH' },
      // BCH: Much higher than BTC due to lower hashrate (~0.00005 to ~0.0002)
      'SHA-256-BCH': { min: 1e-6, max: 5e-4, coin: 'BCH', unit: 'TH' },
      // LTC: ~0.000001 to ~0.00001 LTC/MH/day
      'Scrypt': { min: 1e-8, max: 1e-4, coin: 'LTC', unit: 'MH' },
      // DOGE: ~0.001 to ~0.1 DOGE/MH/day (merged mining)
      'DOGE': { min: 1e-4, max: 1, coin: 'DOGE', unit: 'MH' },
      // KAS: ~0.001 to ~0.1 KAS/GH/day
      'KHeavyHash': { min: 1e-5, max: 1, coin: 'KAS', unit: 'GH' },
      // ETC: ~0.00005 to ~0.001 ETC/MH/day
      'Etchash': { min: 1e-6, max: 50, coin: 'ETC', unit: 'MH' },
      // DASH: ~0.0001 to ~0.01 DASH/GH/day
      'X11': { min: 1e-6, max: 0.1, coin: 'DASH', unit: 'GH' },
      // ZEC: ~0.00005 to ~0.005 ZEC/kSol/day
      'Equihash': { min: 1e-6, max: 0.01, coin: 'ZEC', unit: 'kSol' },
      // DGB: ~0.01 to ~50 DGB/TH/day (SHA-256, large block reward)
      'SHA-256-DGB': { min: 0.001, max: 100, coin: 'DGB', unit: 'TH' },
      // XEC: Live ~5,118 XEC/TH/day post-halving (refreshed 2026-04-20, 5x tolerance)
      'SHA-256-XEC': { min: 1024, max: 25590, coin: 'XEC', unit: 'TH' },
      // ALPH: Blake3, live ~0.003 ALPH/GH/day (refreshed 2026-04-20, 5x tolerance)
      'Blake3': { min: 0.0006, max: 0.016, coin: 'ALPH', unit: 'GH' },
      // FB: SHA-256 standalone, live ~0.0694 FB/TH/day (refreshed 2026-04-20 post-calibration, 5x tolerance)
      'SHA-256-FB': { min: 0.014, max: 0.35, coin: 'FB', unit: 'TH' },
      // QUAI-SHA: Cyprus-1 zone, live ~1.2 QUAI/TH/day (refreshed 2026-04-20, 5x tolerance)
      'SHA-256-QUAI': { min: 0.24, max: 6.0, coin: 'QUAI', unit: 'TH' },
      // QUAI-Scrypt: Scrypt zone, live ~0.0203 QUAI/MH/day (refreshed 2026-04-20, 5x tolerance)
      'Scrypt-QUAI': { min: 0.0041, max: 0.102, coin: 'QUAI', unit: 'MH' },
      // BSV: SHA-256, live ~0.00202 BSV/TH/day (WhatsOnChain 2026-10-07, 5x tolerance)
      'SHA-256-BSV': { min: 0.0004, max: 0.0101, coin: 'BSV', unit: 'TH' }
    };
    
    // Track last known good rates for fallback
    let lastKnownGoodRates = {};
    let rateSanityWarnings = [];
    
    function validateAndUpdateRate(algo, newRate, coinName) {
      const range = RATE_SANITY_RANGES[algo];
      if (!range) {
        // No validation defined, accept the rate
        return { valid: true, rate: newRate };
      }
      
      if (!Number.isFinite(newRate) || newRate <= 0) {
        console.warn(`\u26A0\uFE0F ${coinName} rate is invalid (${newRate}), using fallback`);
        rateSanityWarnings.push(`${coinName}: Invalid rate received`);
        return { valid: false, rate: lastKnownGoodRates[algo] || REVENUE_RATES[algo]?.perUnit };
      }
      
      if (newRate < range.min || newRate > range.max) {
        console.warn(`\u26A0\uFE0F ${coinName} rate ${newRate} outside sanity range [${range.min}, ${range.max}], using fallback`);
        rateSanityWarnings.push(`${coinName}: Rate ${newRate.toExponential(2)} outside expected range`);
        return { valid: false, rate: lastKnownGoodRates[algo] || REVENUE_RATES[algo]?.perUnit };
      }
      
      // Rate is valid, save as last known good
      lastKnownGoodRates[algo] = newRate;
      return { valid: true, rate: newRate };
    }
    
    function updateRevenueRatesFromStats(data) {
      // Calculate revenue rate: (block_reward * blocks_per_day) / network_hashrate
      // blocks_per_day = 86400 / block_time
      
      // Clear previous warnings
      rateSanityWarnings = [];
      
      // BTC
      if (data.BTC && data.BTC.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.BTC.block_time || 600);
        const dailyCoins = (data.BTC.block_reward || 3.125) * blocksPerDay;
        // Network hashrate is in H/s, we need per TH/s
        const perTH = dailyCoins / (data.BTC.network_hashrate / 1e12);
        
        const validation = validateAndUpdateRate('SHA-256', perTH, 'BTC');
        if (validation.rate) {
          REVENUE_RATES['SHA-256'].perUnit = validation.rate;
          console.log('BTC rate updated:', validation.rate, 'BTC/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // LTC
      if (data.LTC && data.LTC.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.LTC.block_time || 150);
        const dailyCoins = (data.LTC.block_reward || 6.25) * blocksPerDay;
        // Network hashrate is in H/s, we need per MH/s
        const perMH = dailyCoins / (data.LTC.network_hashrate / 1e6);
        
        const validation = validateAndUpdateRate('Scrypt', perMH, 'LTC');
        if (validation.rate) {
          REVENUE_RATES['Scrypt'].perUnit = validation.rate;
          console.log('LTC rate updated:', validation.rate, 'LTC/MH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // DOGE (merged with LTC)
      if (data.DOGE && data.DOGE.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.DOGE.block_time || 60);
        const dailyCoins = (data.DOGE.block_reward || 10000) * blocksPerDay;
        const perMH = dailyCoins / (data.DOGE.network_hashrate / 1e6);
        
        const validation = validateAndUpdateRate('DOGE', perMH, 'DOGE');
        if (REVENUE_RATES['Scrypt'].merged && validation.rate) {
          REVENUE_RATES['Scrypt'].merged.perUnit = validation.rate;
          console.log('DOGE rate updated:', validation.rate, 'DOGE/MH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // KAS
      if (data.KAS && data.KAS.difficulty > 0) {
        // KAS uses different calculation due to DAG
        // Approximate: daily coins = hashrate_share * daily_emission
        const blocksPerDay = 86400 / (data.KAS.block_time || 1);
        const dailyCoins = (data.KAS.block_reward || 50) * blocksPerDay;
        // For KAS, difficulty is more relevant than hashrate
        // perUnit in GH/s
        if (data.KAS.network_hashrate > 0) {
          const perGH = dailyCoins / (data.KAS.network_hashrate / 1e9);
          
          const validation = validateAndUpdateRate('KHeavyHash', perGH, 'KAS');
          if (validation.rate) {
            REVENUE_RATES['KHeavyHash'].perUnit = validation.rate;
            console.log('KAS rate updated:', validation.rate, 'KAS/GH/day', validation.valid ? '\u2714' : '(fallback)');
          }
        }
      }
      
      // ETC
      if (data.ETC && data.ETC.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.ETC.block_time || 13.46);
        const dailyCoins = (data.ETC.block_reward || 1.99) * blocksPerDay;
        const perMH = dailyCoins / (data.ETC.network_hashrate / 1e6);
        
        const validation = validateAndUpdateRate('Etchash', perMH, 'ETC');
        if (validation.rate) {
          REVENUE_RATES['Etchash'].perUnit = validation.rate;
          console.log('ETC rate updated:', validation.rate, 'ETC/MH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // BCH
      if (data.BCH && data.BCH.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.BCH.block_time || 600);
        const dailyCoins = (data.BCH.block_reward || 3.125) * blocksPerDay;
        const perTH = dailyCoins / (data.BCH.network_hashrate / 1e12);
        
        const validation = validateAndUpdateRate('SHA-256-BCH', perTH, 'BCH');
        if (validation.rate) {
          REVENUE_RATES['SHA-256-BCH'].perUnit = validation.rate;
          console.log('BCH rate updated:', validation.rate, 'BCH/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // BSV (SHA-256 via WhatsOnChain). Same hardware as BTC/BCH. Per TH/s.
      if (data.BSV && data.BSV.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.BSV.block_time || 600);
        const dailyCoins = (data.BSV.block_reward || 3.125) * blocksPerDay;
        const perTH = dailyCoins / (data.BSV.network_hashrate / 1e12);
        
        const validation = validateAndUpdateRate('SHA-256-BSV', perTH, 'BSV');
        if (validation.rate) {
          REVENUE_RATES['SHA-256-BSV'].perUnit = validation.rate;
          console.log('BSV rate updated:', validation.rate, 'BSV/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // DASH
      if (data.DASH && data.DASH.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.DASH.block_time || 150);
        const dailyCoins = (data.DASH.block_reward || 1.55) * blocksPerDay;
        const perGH = dailyCoins / (data.DASH.network_hashrate / 1e9);
        
        const validation = validateAndUpdateRate('X11', perGH, 'DASH');
        if (validation.rate) {
          REVENUE_RATES['X11'].perUnit = validation.rate;
          console.log('DASH rate updated:', validation.rate, 'DASH/GH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // ZEC (Equihash)
      // network_hashrate is expected to be in Sol/s
      if (data.ZEC && data.ZEC.network_hashrate > 0) {
        // ZEC: block_time ~75s. block_reward now comes LIVE from the API
        // (getblocksubsidy -> miner share). Fallback 1.25 = the miner's current
        // take-home per block, used only if the live value is missing.
        const blocksPerDay = 86400 / (data.ZEC.block_time || 75);
        const dailyCoins = (data.ZEC.block_reward || 1.25) * blocksPerDay;
        // Hashrate in Sol/s, we need per kSol/s
        const perKSol = dailyCoins / (data.ZEC.network_hashrate / 1e3);
        
        const validation = validateAndUpdateRate('Equihash', perKSol, 'ZEC');
        if (validation.rate) {
          REVENUE_RATES['Equihash'].perUnit = validation.rate;
          console.log('ZEC rate updated:', validation.rate, 'ZEC/kSol/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }
      
      // DGB (SHA-256) via NOWNodes JSON-RPC getmininginfo (SHA-256 specific difficulty)
      if (data.DGB && data.DGB.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.DGB.block_time || 75);
        const dailyCoins = (data.DGB.block_reward || 271) * blocksPerDay;
        // Network hashrate is in H/s, we need per TH/s
        const perTH = dailyCoins / (data.DGB.network_hashrate / 1e12);
        
        const validation = validateAndUpdateRate('SHA-256-DGB', perTH, 'DGB');
        if (validation.rate) {
          REVENUE_RATES['SHA-256-DGB'].perUnit = validation.rate;
          console.log('DGB rate updated:', validation.rate, 'DGB/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }

      // XEC (SHA-256 via NOWNodes Blockbook)
      // Small network ~50 PH/s. XEC has 2 extra decimals vs BTC (3,125,000 XEC = 1 BCH reward equivalent)
      if (data.XEC && data.XEC.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.XEC.block_time || 600);
        const dailyCoins = (data.XEC.block_reward || 1812500) * blocksPerDay;
        const perTH = dailyCoins / (data.XEC.network_hashrate / 1e12);

        const validation = validateAndUpdateRate('SHA-256-XEC', perTH, 'XEC');
        if (validation.rate) {
          REVENUE_RATES['SHA-256-XEC'].perUnit = validation.rate;
          console.log('XEC rate updated:', validation.rate, 'XEC/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }

      // ALPH (Blake3 via Alephium Explorer Backend API)
      // Network hashrate in H/s, per GH/s. Reward ~3.0 ALPH/block, 64s block time
      if (data.ALPH && data.ALPH.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.ALPH.block_time || 0.5);
        const dailyCoins = (data.ALPH.block_reward || 0.1433) * blocksPerDay;
        const perGH = dailyCoins / (data.ALPH.network_hashrate / 1e9);

        const validation = validateAndUpdateRate('Blake3', perGH, 'ALPH');
        if (validation.rate) {
          REVENUE_RATES['Blake3'].perUnit = validation.rate;
          console.log('ALPH rate updated:', validation.rate, 'ALPH/GH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }

      // FB (SHA-256 via Fractal mempool API)
      // 621 EH/s network, 25 FB/block, 30s block time. Per TH/s very small number.
      if (data.FB && data.FB.network_hashrate > 0) {
        const blocksPerDay = 86400 / (data.FB.block_time || 45);
        const dailyCoins = (data.FB.block_reward || 25) * blocksPerDay;
        const perTH = dailyCoins / (data.FB.network_hashrate / 1e12);

        const validation = validateAndUpdateRate('SHA-256-FB', perTH, 'FB');
        if (validation.rate) {
          REVENUE_RATES['SHA-256-FB'].perUnit = validation.rate;
          console.log('FB rate updated:', validation.rate, 'FB/TH/day', validation.valid ? '\u2714' : '(fallback)');
        }
      }

      // QUAI-SHA (SHA-256 zone via WhatToMine, returned as data["QUAI-SHA"])
      // ~5 QUAI/block, ~1.3s block time. Per TH/s.
      const quaiSHAData = data["QUAI-SHA"];
      if (quaiSHAData && quaiSHAData.network_hashrate > 0) {
        const blocksPerDay = 86400 / (quaiSHAData.block_time || 1.3);
        const dailyCoins = (quaiSHAData.block_reward || 5) * blocksPerDay;
        const perTH = dailyCoins / (quaiSHAData.network_hashrate / 1e12);
        const valSHA = validateAndUpdateRate('SHA-256-QUAI', perTH, 'QUAI-SHA');
        if (valSHA.rate) {
          REVENUE_RATES['SHA-256-QUAI'].perUnit = valSHA.rate;
          console.log('QUAI-SHA rate updated:', valSHA.rate, 'QUAI/TH/day', valSHA.valid ? '\u2714' : '(fallback)');
        }
      }

      // QUAI-SCRYPT (Scrypt zone via WhatToMine, returned as data["QUAI-SCRYPT"])
      // Same network token, separate algorithm chain. ~5 QUAI/block, ~1.2s block time. Per MH/s.
      const quaiScryptData = data["QUAI-SCRYPT"];
      if (quaiScryptData && quaiScryptData.network_hashrate > 0) {
        const blocksPerDay = 86400 / (quaiScryptData.block_time || 1.2);
        const dailyCoins = (quaiScryptData.block_reward || 5) * blocksPerDay;
        const perMH = dailyCoins / (quaiScryptData.network_hashrate / 1e6);
        const valScrypt = validateAndUpdateRate('Scrypt-QUAI', perMH, 'QUAI-Scrypt');
        if (valScrypt.rate) {
          REVENUE_RATES['Scrypt-QUAI'].perUnit = valScrypt.rate;
          console.log('QUAI-Scrypt rate updated:', valScrypt.rate, 'QUAI/MH/day', valScrypt.valid ? '\u2714' : '(fallback)');
        }
      }

      // Show warning banner if any rates failed validation
      updateSanityWarningBanner();
    }
    
    function updateSanityWarningBanner() {
      let banner = document.getElementById('sanity-warning-banner');
      
      if (rateSanityWarnings.length === 0) {
        if (banner) banner.style.display = 'none';
        const ticker = document.querySelector('.ticker-container');
        if (ticker) ticker.classList.remove('banner-offset');
        return;
      }
      
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sanity-warning-banner';
        banner.style.cssText = 'background: #ff9800; color: #000; padding: 10px 15px; text-align: center; font-weight: 400; position: fixed; top: 0; left: 0; right: 0; z-index: 9999;';
        document.body.prepend(banner);
      }
      
      banner.innerHTML = '\u26A0\uFE0F Data Warning: ' + rateSanityWarnings.join(', ') + ' \u2014 Using fallback values. <a href="#" onclick="this.parentElement.style.display=\'none\'; document.querySelector(\'.ticker-container\')?.classList.remove(\'banner-offset\'); return false;" style="color: #000; margin-left: 10px;">[Dismiss]</a>';
      banner.style.display = 'block';
      const tickerEl = document.querySelector('.ticker-container');
      if (tickerEl) tickerEl.classList.add('banner-offset');
    }
    
    function loadCachedMiningStats() {
      try {
        const cached = localStorage.getItem('solaray_mining_stats');
        if (cached) {
          const data = JSON.parse(cached);
          // Check if cache is less than 48 hours old
          const cacheAge = Date.now() - data.timestamp;
          if (cacheAge < 48 * 60 * 60 * 1000) {
            rawMiningStats = data.stats;
            updateRevenueRatesFromStats(data.stats);
            lastMiningStatsUpdate = new Date(data.timestamp);
            miningStatsStatus = 'cached';
            updateMiningStatsIndicator();
            console.log('Loaded cached mining stats from:', lastMiningStatsUpdate);
            return true;
          }
        }
      } catch (error) {
        console.warn('Failed to load cached mining stats:', error);
      }
      return false;
    }
    
    function updateMiningStatsIndicator() {
      const indicator = document.getElementById('mining-stats-indicator');
      if (!indicator) return;
      
      if (miningStatsStatus === 'live') {
        indicator.innerHTML = '\u{1F7E2} Live Difficulty';
        indicator.className = 'price-indicator live';
      } else if (miningStatsStatus === 'cached') {
        const ago = getTimeAgo(lastMiningStatsUpdate);
        indicator.innerHTML = `\u{1F7E1} Cached Difficulty (${ago})`;
        indicator.className = 'price-indicator cached';
      } else {
        indicator.innerHTML = '\u{1F534} Default Estimates';
        indicator.className = 'price-indicator default';
      }
      
      // Refresh the shared data-age badge
      updateDataAgeBadge();
    }
    
    async function initMiningStats() {
      // Try to fetch live mining stats first
      const liveSuccess = await fetchMiningStats();
      
      // If live fetch failed, try to load from cache
      if (!liveSuccess) {
        const cacheLoaded = loadCachedMiningStats();
        if (!cacheLoaded) {
          miningStatsStatus = 'default';
          updateMiningStatsIndicator();
        }
      }
      
      // If user already calculated, refresh the network stats display
      if (lastCalculatedAlgorithm) {
        displayNetworkStats(lastCalculatedAlgorithm);
      }
    }
    
    // ============================================
    // All coins now use direct APIs via /api/mining-stats
    
    // Display network stats for the calculated coin
    function displayNetworkStats(algorithm) {
      const container = document.getElementById('network-stats');
      const textEl = document.getElementById('network-stats-text');
      
      if (!container || !textEl) return;
      
      // Map algorithm to coin(s)
      const algoCoinMap = {
        'SHA-256': ['BTC'],
        'SHA-256-BCH': ['BCH'],
        'Scrypt': ['LTC', 'DOGE'],
        'KHeavyHash': ['KAS'],
        'Etchash': ['ETC'],
        'Equihash': ['ZEC'],
        'X11': ['DASH'],
        'SHA-256-DGB': ['DGB'],
        'SHA-256-XEC': ['XEC'],
        'Blake3': ['ALPH'],
        'SHA-256-FB': ['FB'],
        'SHA-256-QUAI': ['QUAI'],
        'Scrypt-QUAI': ['QUAI'],
        'SHA-256-BSV': ['BSV']
      };
      
      const coins = algoCoinMap[algorithm];
      if (!coins || miningStatsStatus === 'default') {
        container.style.visibility = 'hidden';
        return;
      }
      
      let statsLines = [];
      
      for (const coin of coins) {
        const stats = rawMiningStats[coin];
        if (stats && (stats.difficulty > 0 || stats.network_hashrate > 0)) {
          const diff = formatDifficulty(stats.difficulty);
          const hashrate = formatHashrate(stats.network_hashrate);
          const block = formatBlockHeight(stats.height);
          
          statsLines.push(`<strong>Live ${coin} Network:</strong> Difficulty ${diff} | Nethash ${hashrate} | Block ${block}`);
        }
      }
      
      if (statsLines.length > 0) {
        textEl.innerHTML = statsLines.join('<br>');
        container.style.visibility = 'visible';
      } else {
        container.style.visibility = 'hidden';
      }
    }
    
    // ============================================
    // DROPDOWN LOGIC
    // ============================================
    function getFilteredMiners() {
      const voltageFilter = document.getElementById('voltage-filter').value;
      
      if (voltageFilter === '120V') return MINERS_120V;
      if (voltageFilter === '240V') return MINERS_240V;
      return ALL_MINERS;
    }
    
    // Track custom price overrides per coin
    let customPrices = {};
    let currentDisplayedCoin = null;
    
    function updateLivePriceDisplay() {
      const algoFilter = document.getElementById('algorithm-filter').value;
      const display = document.getElementById('live-price-display');
      const coinEl = document.getElementById('live-price-coin');
      const inputEl = document.getElementById('live-price-input');
      const statusEl = document.getElementById('live-price-status');
      const resetBtn = document.getElementById('price-reset-btn');
      
      // Map algorithm to coin
      const algoCoinMap = {
        'SHA-256': 'BTC',
        'SHA-256-BCH': 'BCH',
        'Scrypt': 'LTC',
        'KHeavyHash': 'KAS',
        'Etchash': 'ETC',
        'Equihash': 'ZEC',
        'X11': 'DASH',
        'SHA-256-DGB': 'DGB',
        'SHA-256-XEC': 'XEC',
        'Blake3': 'ALPH',
        'SHA-256-FB': 'FB',
        'SHA-256-QUAI': 'QUAI',
        'Scrypt-QUAI': 'QUAI',
        'SHA-256-BSV': 'BSV'
      };
      
      if (algoFilter === 'all') {
        display.style.visibility = 'hidden'; display.style.position = 'absolute';
        return;
      }
      
      const coin = algoCoinMap[algoFilter];
      if (!coin) {
        display.style.visibility = 'hidden'; display.style.position = 'absolute';
        return;
      }
      
      currentDisplayedCoin = coin;
      const livePrice = PRICES[coin] || 0;
      const hasCustomPrice = customPrices.hasOwnProperty(coin);
      const displayPrice = hasCustomPrice ? customPrices[coin] : livePrice;
      
      coinEl.textContent = coin;
      inputEl.value = displayPrice >= 1 ? displayPrice.toLocaleString('en-US', {maximumFractionDigits: 2}) : displayPrice.toFixed(4);
      
      // Update status indicator and styling based on custom vs live
      if (hasCustomPrice) {
        statusEl.textContent = '\u{1F7E3} Custom';
        statusEl.className = 'live-price-status custom';
        inputEl.classList.add('custom-price');
        resetBtn.style.display = 'inline-block';
      } else if (priceStatus === 'live') {
        statusEl.textContent = '\u{1F7E2} Live';
        statusEl.className = 'live-price-status';
        inputEl.classList.remove('custom-price');
        resetBtn.style.display = 'none';
      } else if (priceStatus === 'cached') {
        const ago = getTimeAgo(lastPriceUpdate);
        statusEl.textContent = `\u{1F7E1} ${ago}`;
        statusEl.className = 'live-price-status cached';
        inputEl.classList.remove('custom-price');
        resetBtn.style.display = 'none';
      } else {
        statusEl.textContent = '\u{1F534} Unavailable';
        statusEl.className = 'live-price-status default';
        inputEl.classList.remove('custom-price');
        resetBtn.style.display = 'none';
      }
      
      display.style.visibility = 'visible'; display.style.position = 'relative'; display.style.display = 'flex';
    }
    
    // Get the effective price for calculations (custom or live)
    function getEffectivePrice(coin) {
      if (customPrices.hasOwnProperty(coin)) {
        return customPrices[coin];
      }
      return PRICES[coin] || 0;
    }
    
    // Handle custom price input
    function initPriceInput() {
      const inputEl = document.getElementById('live-price-input');
      const resetBtn = document.getElementById('price-reset-btn');
      
      inputEl.addEventListener('change', function() {
        if (!currentDisplayedCoin) return;
        
        // Parse the entered value (remove commas)
        let newPrice = parseFloat(this.value.replace(/,/g, ''));
        if (isNaN(newPrice) || newPrice < 0) {
          // Invalid input - reset to current
          updateLivePriceDisplay();
          return;
        }
        
        // Store custom price
        customPrices[currentDisplayedCoin] = newPrice;
        updateLivePriceDisplay();
        
        // Recalculate if a miner is selected
        if (selectedMiner) {
          calculate();
        }
      });
      
      inputEl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          this.blur();
        }
      });
      
      resetBtn.addEventListener('click', function() {
        if (!currentDisplayedCoin) return;
        
        // Remove custom price override
        delete customPrices[currentDisplayedCoin];
        updateLivePriceDisplay();
        
        // Recalculate if a miner is selected
        if (selectedMiner) {
          calculate();
        }
      });
    }
    
    function updateMinerDropdown() {
      const algoFilter = document.getElementById('algorithm-filter').value;
      const minerSelect = document.getElementById('miner-select');
      
      let miners = getFilteredMiners();
      
      if (algoFilter !== 'all') {
        // SHA-256 variants all use same physical miners — remap to SHA-256 for dropdown
        // Scrypt-QUAI uses same Scrypt hardware — remap to Scrypt
        const sha256Variants = ['SHA-256-BCH', 'SHA-256-DGB', 'SHA-256-XEC', 'SHA-256-FB', 'SHA-256-QUAI', 'SHA-256-BSV'];
        const filterAlgo = sha256Variants.includes(algoFilter) ? 'SHA-256'
          : algoFilter === 'Scrypt-QUAI' ? 'Scrypt'
          : algoFilter;
        miners = miners.filter(m => m.algorithm === filterAlgo);
      }
      
      minerSelect.innerHTML = '<option value="">-- Select Miner --</option>';
      miners.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        // Style Loki miners purple
        if (m.loki) {
          opt.style.color = '#9c27b0';
        }
        minerSelect.appendChild(opt);
      });
      
      // Update live price display
      updateLivePriceDisplay();
      
      // Clear selection
      document.getElementById('miner-info').classList.remove('active');
      document.getElementById('miner-info').classList.remove('loki-miner');
      selectedMiner = null;
    }
    
    // ============================================
    // MINING TYPE LOGIC (ASIC/GPU/CPU)
    // ============================================
    let currentMiningType = 'ASIC';
    
    function updateMiningType() {
      // ASIC is the only mining type now. Function kept as an init hook
      // (called on page load) to populate the algorithm dropdown.
      currentMiningType = 'ASIC';
      
      const algoSelect = document.getElementById('algorithm-filter');
      
      // Populate algorithm dropdown for ASIC
      algoSelect.innerHTML = '';
      ALGORITHM_CONFIG.ASIC.forEach(algo => {
        const opt = document.createElement('option');
        opt.value = algo.value;
        opt.textContent = algo.label;
        algoSelect.appendChild(opt);
      });
      
      updateMinerDropdown();
    }
    
    function selectMiner() {
      const id = document.getElementById('miner-select').value;
      if (!id) {
        document.getElementById('miner-info').classList.remove('active');
        document.getElementById('miner-info').classList.remove('loki-miner');
        selectedMiner = null;
        return;
      }
      
      selectedMiner = ALL_MINERS.find(m => m.id === id);
      if (!selectedMiner) return;
      
      const infoCard = document.getElementById('miner-info');
      infoCard.classList.add('active');
      infoCard.classList.toggle('loki-miner', selectedMiner.loki);
      
      const nameEl = document.getElementById('info-name');
      nameEl.textContent = selectedMiner.name;
      nameEl.classList.toggle('loki', selectedMiner.loki);
      
      document.getElementById('info-manufacturer').textContent = selectedMiner.manufacturer;
      document.getElementById('info-hashrate').textContent = `${selectedMiner.hashrate} ${selectedMiner.unit}`;
      document.getElementById('info-power').textContent = selectedMiner.power + 'W';
      
      const voltageEl = document.getElementById('info-voltage');
      voltageEl.textContent = selectedMiner.voltage;
      voltageEl.className = 'spec-value ' + (selectedMiner.voltage === '120V' ? 'v120' : 'v240');
      
      document.getElementById('info-noise').textContent = getNoiseIcon(selectedMiner.noise) + ' ' + selectedMiner.noiseLabel;
      document.getElementById('info-cooling').textContent = selectedMiner.cooling;
      document.getElementById('info-coins').textContent = selectedMiner.coins.join(', ');
      document.getElementById('info-runcost').textContent = `\u26A1 $${getDailyCost(selectedMiner.power).toFixed(2)}/day to run`;
      
      // Badges
      document.getElementById('info-lottery').style.display = selectedMiner.category === 'lottery' ? 'inline' : 'none';
      document.getElementById('info-loki-badge').style.display = selectedMiner.loki ? 'inline' : 'none';
      
      // Loki notice
      document.getElementById('loki-notice').style.display = selectedMiner.loki ? 'block' : 'none';
      
      // Config inputs
      document.getElementById('config-hashrate').value = selectedMiner.hashrate;
      document.getElementById('config-power').value = selectedMiner.power;
    }
    
    // ============================================
    // RESET
    // ============================================
    function animateCupReset() {
      var liquid = document.getElementById('cup-liquid');
      if (liquid) {
        liquid.classList.remove('refilling');
        liquid.classList.add('draining');
        setTimeout(function() {
          resetCalculator();
          liquid.classList.remove('draining');
          liquid.classList.add('refilling');
          setTimeout(function() {
            liquid.classList.remove('refilling');
          }, 650);
        }, 850);
      } else {
        resetCalculator();
      }
    }

    function resetCalculator() {
      document.getElementById('mining-type-filter').value = 'ASIC';
      document.getElementById('voltage-filter').value = 'all';
      document.getElementById('algorithm-filter').value = 'all';
      document.getElementById('miner-select').value = '';
      document.getElementById('miner-info').classList.remove('active');
      document.getElementById('miner-info').classList.remove('loki-miner');
      document.getElementById('miner-cost').value = '0';
      document.getElementById('solar-hours').value = '6';
      document.getElementById('free-hours').value = '6';
      document.getElementById('battery-hours').value = '0';
      document.getElementById('idle-hours').value = '0';
      document.getElementById('grid-rate').value = '0.15';
      document.getElementById('pool-fee').value = '1';
      document.getElementById('use-aftermarket').checked = false;
      document.getElementById('dev-fee').value = '2';
      document.getElementById('dev-fee-wrapper').style.display = 'none';
      document.getElementById('results-panel').classList.remove('active');
      document.getElementById('voltage-group').style.display = 'flex';
      document.getElementById('miner-row').style.display = 'grid';
      selectedMiner = null;
      currentMiningType = 'ASIC';
      updateMiningType();
      updateTimeline();
    }
    
    // ============================================
    // DEV FEE TOGGLE
    // ============================================
    function toggleDevFee() {
      const checkbox = document.getElementById('use-aftermarket');
      const wrapper = document.getElementById('dev-fee-wrapper');
      wrapper.style.display = checkbox.checked ? 'flex' : 'none';
    }
    
    // ============================================
    // CAP HOURS TO 24 TOTAL
    // ============================================
    function capHours(changedInput) {
      const solar = parseInt(document.getElementById('solar-hours').value) || 0;
      const free = parseInt(document.getElementById('free-hours').value) || 0;
      const battery = parseInt(document.getElementById('battery-hours').value) || 0;
      const idle = parseInt(document.getElementById('idle-hours').value) || 0;
      const total = solar + free + battery + idle;
      
      if (total > 24) {
        const excess = total - 24;
        const currentVal = parseInt(changedInput.value) || 0;
        changedInput.value = Math.max(0, currentVal - excess);
      }
      updateTimeline();
    }
    
    // ============================================
    // TIMELINE (with idle time)
    // ============================================
    function updateTimeline() {
      const solar = parseInt(document.getElementById('solar-hours').value) || 0;
      const free = parseInt(document.getElementById('free-hours').value) || 0;
      const battery = parseInt(document.getElementById('battery-hours').value) || 0;
      const idle = parseInt(document.getElementById('idle-hours').value) || 0;
      const _gridRateRaw = parseFloat(document.getElementById('grid-rate').value);
      const gridRate = Number.isFinite(_gridRateRaw) ? _gridRateRaw : 0.15;
      const grid = Math.max(0, 24 - solar - free - battery - idle);
      
      document.getElementById('grid-rate-display').textContent = gridRate.toFixed(2);
      
      const timeline = document.getElementById('timeline');
      timeline.innerHTML = '';
      
      if (solar > 0) {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment timeline-solar';
        seg.style.flex = solar;
        seg.textContent = `\u2600\uFE0F ${solar}h`;
        timeline.appendChild(seg);
      }
      if (free > 0) {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment timeline-free';
        seg.style.flex = free;
        seg.textContent = `\u{1F319} ${free}h`;
        timeline.appendChild(seg);
      }
      if (battery > 0) {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment timeline-battery';
        seg.style.flex = battery;
        seg.textContent = `\u{1F50B} ${battery}h`;
        timeline.appendChild(seg);
      }
      if (grid > 0) {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment timeline-grid';
        seg.style.flex = grid;
        seg.textContent = `\u26A1 ${grid}h`;
        timeline.appendChild(seg);
      }
      if (idle > 0) {
        const seg = document.createElement('div');
        seg.className = 'timeline-segment timeline-idle';
        seg.style.flex = idle;
        seg.textContent = `\u2638\uFE0F ${idle}h`;
        timeline.appendChild(seg);
      }
    }
    
    // ============================================
    // CALCULATE (with idle time affecting revenue)
    // ============================================
    function calculate() {
      // Track calculator usage
      if (typeof gtag === 'function') {
        var trackName = document.getElementById('miner-select');
        var trackLabel = trackName ? trackName.options[trackName.selectedIndex].text : 'unknown';
        gtag('event', 'calculate_profitability', { miner: trackLabel });
      }
      
      let hashrate, power, cost, algorithm;
      
      // ASIC is the only mining type. Require a selected miner.
      if (!selectedMiner) {
        alert('Please select a miner first.');
        return;
      }
      hashrate = parseFloat(document.getElementById('config-hashrate').value) || selectedMiner.hashrate;
      power = parseFloat(document.getElementById('config-power').value) || selectedMiner.power;
      cost = parseFloat(document.getElementById('miner-cost').value) || 0;
      
      // Use algorithm filter to determine correct coin variant
      // SHA-256 variants and Scrypt-QUAI override the miner's base algorithm
      const algoFilter = document.getElementById('algorithm-filter').value;
      const algoOverrides = ['SHA-256-BCH', 'SHA-256-DGB', 'SHA-256-XEC', 'SHA-256-FB', 'SHA-256-QUAI', 'SHA-256-BSV', 'Scrypt-QUAI'];
      algorithm = algoOverrides.includes(algoFilter) ? algoFilter : selectedMiner.algorithm;
      
      const solarHours = parseInt(document.getElementById('solar-hours').value) || 0;
      const freeHours = parseInt(document.getElementById('free-hours').value) || 0;
      const batteryHours = parseInt(document.getElementById('battery-hours').value) || 0;
      const idleHours = parseInt(document.getElementById('idle-hours').value) || 0;
      const _gridRateRaw2 = parseFloat(document.getElementById('grid-rate').value);
      const gridRate = Number.isFinite(_gridRateRaw2) ? _gridRateRaw2 : 0.15;
      const _poolFeeRaw = parseFloat(document.getElementById('pool-fee').value);
      const poolFee = Number.isFinite(_poolFeeRaw) ? _poolFeeRaw : 1;
      const useAftermarket = document.getElementById('use-aftermarket').checked;
      const _devFeeRaw = parseFloat(document.getElementById('dev-fee').value);
      const devFee = useAftermarket ? (Number.isFinite(_devFeeRaw) ? _devFeeRaw : 2) : 0;
      const totalFees = poolFee + devFee;
      const gridHours = Math.max(0, 24 - solarHours - freeHours - batteryHours - idleHours);
      
      // Active mining hours (excludes idle)
      const activeHours = 24 - idleHours;
      const activeFraction = activeHours / 24;
      
      // Electricity (only paid during grid hours, no cost during idle)
      const kW = power / 1000;
      const paidKWh = kW * gridHours;
      const dailyElecCost = paidKWh * gridRate;
      
      // Revenue
      const rateInfo = REVENUE_RATES[algorithm];
      if (!rateInfo) {
        alert('Algorithm not supported. Please select a valid algorithm.');
        return;
      }
      
      // Calculate primary coin
      const fullDailyCrypto = hashrate * rateInfo.perUnit;
      const dailyCrypto = fullDailyCrypto * activeFraction;
      const coinPrice = getEffectivePrice(rateInfo.coin);
      
      // Remove any previous price banner
      const oldBanner = document.getElementById('price-unavailable-msg');
      if (oldBanner) oldBanner.remove();
      
      let dailyRevenue = dailyCrypto * coinPrice * (1 - totalFees / 100);
      
      // Handle merged mining (Scrypt = LTC + DOGE)
      let dailyMergedCrypto = 0;
      let mergedCoin = '';
      let mergedCoinPrice = 0;
      if (rateInfo.merged) {
        const fullDailyMerged = hashrate * rateInfo.merged.perUnit;
        dailyMergedCrypto = fullDailyMerged * activeFraction;
        mergedCoin = rateInfo.merged.coin;
        mergedCoinPrice = getEffectivePrice(mergedCoin);
        dailyRevenue += dailyMergedCrypto * mergedCoinPrice * (1 - totalFees / 100);
      }
      
      // Handle dual mining (hardware-level: one machine with two chip types on two algorithms).
      // Only applies to ASIC mode where selectedMiner exists and has a dualMining field.
      // Uses the dual chip's OWN hashrate (not a ratio) against the secondary algorithm's rate.
      let dailyDualCrypto = 0;
      let dualCoin = '';
      let dualCoinPrice = 0;
      if (selectedMiner && selectedMiner.dualMining) {
        const dual = selectedMiner.dualMining;
        const dualRateInfo = REVENUE_RATES[dual.algorithm];
        if (dualRateInfo) {
          const fullDailyDual = dual.hashrate * dualRateInfo.perUnit;
          dailyDualCrypto = fullDailyDual * activeFraction;
          dualCoin = dual.coin;
          dualCoinPrice = getEffectivePrice(dualCoin);
          dailyRevenue += dailyDualCrypto * dualCoinPrice * (1 - totalFees / 100);
        }
      }
      
      const dailyProfit = dailyRevenue - dailyElecCost;
      
      // Periods
      const monthly = (v) => v * 30;
      const yearly = (v) => v * 365;
      
      // ROI & Electricity Stats
      const monthlyProfit = monthly(dailyProfit);
      const breakevenDays = cost > 0 && dailyProfit > 0 ? Math.ceil(cost / dailyProfit) : (dailyProfit <= 0 ? Infinity : 0);
      const annualElecCost = yearly(dailyElecCost);
      const fullGridCost = kW * 24 * gridRate * 365; // What 24/7 grid would cost
      const annualElecSavings = fullGridCost - annualElecCost;
      
      // Update DOM
      document.getElementById('results-panel').classList.add('active');
      
      document.getElementById('breakeven-days').textContent = breakevenDays === Infinity ? '\u221E' : (breakevenDays === 0 ? 'N/A' : breakevenDays);
      document.getElementById('annual-elec-cost').textContent = `$${annualElecCost.toFixed(0)}`;
      document.getElementById('annual-elec-savings').textContent = `$${annualElecSavings.toFixed(0)}`;
      
      document.getElementById('daily-revenue').textContent = `$${dailyRevenue.toFixed(2)}`;
      document.getElementById('daily-elec').textContent = `$${dailyElecCost.toFixed(2)}`;
      document.getElementById('daily-profit').textContent = `$${dailyProfit.toFixed(2)}`;
      
      // Format crypto output - show dual mining, merged mining, or single coin
      if (selectedMiner && selectedMiner.dualMining && dailyDualCrypto > 0) {
        // Dual mining (two coins from separate chips)
        document.getElementById('daily-crypto').textContent = `${dailyCrypto.toFixed(8)} ${rateInfo.coin} + ${dailyDualCrypto.toFixed(4)} ${dualCoin}`;
        document.getElementById('monthly-crypto').textContent = `${monthly(dailyCrypto).toFixed(6)} ${rateInfo.coin} + ${monthly(dailyDualCrypto).toFixed(1)} ${dualCoin}`;
        document.getElementById('yearly-crypto').textContent = `${yearly(dailyCrypto).toFixed(4)} ${rateInfo.coin} + ${Math.round(yearly(dailyDualCrypto)).toLocaleString()} ${dualCoin}`;
        document.getElementById('price-note').textContent = `Prices: ${rateInfo.coin} $${coinPrice.toLocaleString()} | ${dualCoin} $${dualCoinPrice.toFixed(6)} | Dual mining ${activeHours}h/day`;
      } else if (rateInfo.merged) {
        document.getElementById('daily-crypto').textContent = `${dailyCrypto.toFixed(8)} ${rateInfo.coin} + ${dailyMergedCrypto.toFixed(4)} ${mergedCoin}`;
        document.getElementById('monthly-crypto').textContent = `${monthly(dailyCrypto).toFixed(6)} ${rateInfo.coin} + ${monthly(dailyMergedCrypto).toFixed(1)} ${mergedCoin}`;
        document.getElementById('yearly-crypto').textContent = `${yearly(dailyCrypto).toFixed(4)} ${rateInfo.coin} + ${Math.round(yearly(dailyMergedCrypto)).toLocaleString()} ${mergedCoin}`;
        document.getElementById('price-note').textContent = `Prices: ${rateInfo.coin} $${coinPrice.toLocaleString()} | ${mergedCoin} $${mergedCoinPrice.toFixed(4)} | Mining ${activeHours}h/day`;
      } else {
        document.getElementById('daily-crypto').textContent = `${dailyCrypto.toFixed(8)} ${rateInfo.coin}`;
        document.getElementById('monthly-crypto').textContent = `${monthly(dailyCrypto).toFixed(6)} ${rateInfo.coin}`;
        document.getElementById('yearly-crypto').textContent = `${yearly(dailyCrypto).toFixed(4)} ${rateInfo.coin}`;
        document.getElementById('price-note').textContent = `Prices: ${rateInfo.coin} $${coinPrice.toLocaleString()} | Mining ${activeHours}h/day`;
      }
      
      document.getElementById('monthly-revenue').textContent = `$${monthly(dailyRevenue).toFixed(2)}`;
      document.getElementById('monthly-elec').textContent = `$${monthly(dailyElecCost).toFixed(2)}`;
      document.getElementById('monthly-profit-detail').textContent = `$${monthlyProfit.toFixed(2)}`;
      
      document.getElementById('yearly-revenue').textContent = `$${yearly(dailyRevenue).toFixed(2)}`;
      document.getElementById('yearly-elec').textContent = `$${yearly(dailyElecCost).toFixed(2)}`;
      document.getElementById('yearly-profit').textContent = `$${yearly(dailyProfit).toFixed(2)}`;
      
      // Display network stats for the calculated coin
      lastCalculatedAlgorithm = algorithm;
      displayNetworkStats(algorithm);
      
      // Populate contextual links based on selected miner/algorithm
      const ctxLinks = document.getElementById('context-links');
      const ctxInner = document.getElementById('context-links-inner');
      const linkStyle = 'display:inline-block;padding:0.4rem 0.85rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;font-size:0.85rem;transition:all 0.2s ease;';
      let links = [];
      const minerName = selectedMiner ? selectedMiner.name : 'this miner';
      const algoName = algorithm.replace('-BCH', '');
      const coinName = rateInfo.coin;
      links.push(`<a href="miners.html" style="${linkStyle}">&#x1F4B0; View ${minerName} full specs</a>`);
      links.push(`<a href="pools.html" style="${linkStyle}">&#x1F3CA; ${coinName} mining pools</a>`);
      if (selectedMiner && selectedMiner.voltage === '240V') {
        links.push(`<a href="electrical_setup.html" style="${linkStyle}">&#x1F50C; 240V wiring guide</a>`);
      }
      if (selectedMiner && selectedMiner.loki) {
        links.push(`<a href="aftermarket_firmware.html#psu-bypass" style="${linkStyle}">&#x26A1; 120V options: Loki Kit vs PSU Bypass</a>`);
      }
      links.push(`<a href="glossary.html" style="${linkStyle}">&#x1F9E0; Mining terms explained</a>`);
      ctxInner.innerHTML = links.join('');
      ctxLinks.style.display = 'block';
      
      document.getElementById('results-panel').scrollIntoView({ behavior: 'smooth' });
      
      // Show banner if prices are unavailable (all showing $0.00)
      if (priceStatus === 'default' && !coinPrice) {
        const panel = document.getElementById('results-panel');
        const banner = document.createElement('div');
        banner.id = 'price-unavailable-msg';
        banner.style.cssText = 'text-align:center;padding:1.5rem 1rem;margin-top:1rem;background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.25);border-radius:8px;';
        banner.innerHTML = '<p style="color:var(--sola-gold);font-size:1.1rem;margin-bottom:0.75rem;">'
          + '\u26A0\uFE0F Live prices temporarily unavailable</p>'
          + '<p style="color:#8899a8;margin-bottom:1rem;">'
          + 'Revenue shows $0.00 because we could not reach pricing servers. '
          + 'Explore the site while we reconnect:</p>'
          + '<div style="display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:center;">'
          + '<a href="miners.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F527} Miner Catalog</a>'
          + '<a href="datavault.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F4CA} Data Vault</a>'
          + '<a href="glossary.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F9E0} Glossary</a>'
          + '<a href="electrical_setup.html" style="display:inline-block;padding:0.5rem 1rem;background:var(--bg-card);border:1px solid rgba(0,206,209,0.25);border-radius:6px;color:var(--sola-teal);text-decoration:none;">\u{1F50C} Electrical Setup</a>'
          + '</div>';
        panel.appendChild(banner);
      }
    }
    
    // ============================================
    // BROWSE TABLE
    // ============================================
    function toggleBrowse() {
      const btn = document.getElementById('browse-toggle');
      const container = document.getElementById('browse-table-container');
      btn.classList.toggle('open');
      container.classList.toggle('open');
    }
    
    function renderBrowseTable() {
      const tbody = document.getElementById('browse-tbody');
      tbody.innerHTML = ALL_MINERS.map(m => `
        <tr onclick="selectMinerFromTable('${m.id}')" style="cursor: pointer;">
          <td class="${m.loki ? 'loki' : ''}">${m.name}</td>
          <td>${m.algorithm}</td>
          <td>${m.hashrate} ${m.unit}</td>
          <td>${m.power}W</td>
          <td class="${m.voltage === '120V' ? 'v120' : 'v240'}">${m.voltage}</td>
          <td>$${getDailyCost(m.power).toFixed(2)}</td>
        </tr>
      `).join('');
    }
    
    function selectMinerFromTable(id) {
      const miner = ALL_MINERS.find(m => m.id === id);
      if (!miner) return;
      
      // Set voltage filter
      document.getElementById('voltage-filter').value = miner.voltage;
      
      // Set algorithm filter
      document.getElementById('algorithm-filter').value = miner.algorithm;
      
      // Update miner dropdown with new filters
      updateMinerDropdown();
      
      // Select the miner
      document.getElementById('miner-select').value = id;
      selectMiner();
      
      // Scroll to miner section
      document.getElementById('miner-info').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function sortTable(colIndex) {
      const tbody = document.getElementById('browse-tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      rows.sort((a, b) => {
        let aVal = a.cells[colIndex].textContent;
        let bVal = b.cells[colIndex].textContent;
        
        const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return (aNum - bNum) * sortDirection;
        }
        return aVal.localeCompare(bVal) * sortDirection;
      });
      
      sortDirection *= -1;
      rows.forEach(row => tbody.appendChild(row));
    }
    

    // ============================================
    // ============================================
    // LIVE PRICE TICKER (uses calculator price data)
    // ============================================
    const tickerCoins = ['BTC', 'LTC', 'DOGE', 'KAS', 'ETC', 'ZEC', 'DASH', 'BCH', 'DGB', 'XEC', 'ALPH', 'FB', 'QUAI', 'BSV'];
    
    function updateTicker() {
      const tickerTrack = document.getElementById('ticker-track');
      if (!tickerTrack) return;
      
      let html = '';
      
      tickerCoins.forEach(symbol => {
        const price = PRICES[symbol];
        if (price !== undefined && price !== null) {
          let priceFormatted;
          if (price >= 1) {
            priceFormatted = price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
          } else if (price >= 0.0001) {
            priceFormatted = price.toFixed(6);
          } else if (price >= 0.00000001) {
            priceFormatted = price.toPrecision(4);
          } else {
            priceFormatted = price.toExponential(2);
          }
          
          html += `
            <div class="ticker-item">
              <span class="ticker-coin">${symbol}</span>
              <span class="ticker-price">$${priceFormatted}</span>
            </div>
          `;
        }
      });
      
      // Duplicate for seamless loop
      if (html) {
        tickerTrack.innerHTML = html + html;
      }
    }
    
    // Update ticker after prices load and on interval
    // Small delay to ensure PRICES is populated first
    setTimeout(updateTicker, 2000);
    setInterval(updateTicker, 60000);

    // ============================================
    // SUNRISE PICK - Most Profitable Coin (Free Electricity)
    // ============================================
    function calculateSunrisePick() {
      const algorithms = [
        'SHA-256', 'SHA-256-BCH', 'SHA-256-DGB', 'SHA-256-XEC', 'SHA-256-FB', 'SHA-256-QUAI', 'SHA-256-BSV',
        'Scrypt', 'Scrypt-QUAI',
        'KHeavyHash', 'Etchash', 'Equihash', 'X11',
        'Blake3'
      ];
      const results = [];
      
      algorithms.forEach(algo => {
        const rateInfo = REVENUE_RATES[algo];
        if (!rateInfo) return;
        
        // All SHA-256 variants (BCH, BSV, DGB, XEC, FB, QUAI) share the same physical SHA-256 ASICs as BTC.
        // Scrypt-QUAI uses the same physical Scrypt ASICs as LTC/DOGE.
        // Alias them to the underlying algorithm for miner selection; the rate lookup still uses the variant.
        const sha256Aliases = ['SHA-256-BCH', 'SHA-256-DGB', 'SHA-256-XEC', 'SHA-256-FB', 'SHA-256-QUAI', 'SHA-256-BSV'];
        let filterAlgo;
        if (sha256Aliases.includes(algo)) {
          filterAlgo = 'SHA-256';
        } else if (algo === 'Scrypt-QUAI') {
          filterAlgo = 'Scrypt';
        } else {
          filterAlgo = algo;
        }
        const miners = ALL_MINERS.filter(m => m.algorithm === filterAlgo && m.category !== 'lottery');
        if (miners.length === 0) return;
        
        const bestMiner = miners.reduce((best, m) => {
          const mHash = m.hashrate;
          const bestHash = best ? best.hashrate : 0;
          return mHash > bestHash ? m : best;
        }, null);
        
        if (!bestMiner) return;
        
        const dailyCrypto = bestMiner.hashrate * rateInfo.perUnit;
        const coinPrice = PRICES[rateInfo.coin] || 0;
        let dailyRevenue = dailyCrypto * coinPrice;
        
        if (rateInfo.merged) {
          const dailyMerged = bestMiner.hashrate * rateInfo.merged.perUnit;
          const mergedPrice = PRICES[rateInfo.merged.coin] || 0;
          dailyRevenue += dailyMerged * mergedPrice;
        }
        
        // Dual mining (hardware-level, e.g. DragonBall A11).
        // Secondary chip has its own hashrate and algorithm &mdash; credit the extra coin.
        if (bestMiner.dualMining) {
          const dual = bestMiner.dualMining;
          const dualRateInfo = REVENUE_RATES[dual.algorithm];
          if (dualRateInfo) {
            const dailyDual = dual.hashrate * dualRateInfo.perUnit;
            const dualPrice = PRICES[dual.coin] || 0;
            dailyRevenue += dailyDual * dualPrice;
          }
        }
        
        results.push({
          coin: rateInfo.coin,
          miner: bestMiner.name,
          dailyRevenue: dailyRevenue,
          algorithm: algo
        });
      });
      
      // Deduplicate by coin: keep only the highest-revenue variant per coin.
      // Example: QUAI appears under both SHA-256-QUAI and Scrypt-QUAI &mdash; show the winning variant only.
      const bestPerCoin = {};
      results.forEach(r => {
        if (!bestPerCoin[r.coin] || r.dailyRevenue > bestPerCoin[r.coin].dailyRevenue) {
          bestPerCoin[r.coin] = r;
        }
      });
      const deduped = Object.values(bestPerCoin);
      
      deduped.sort((a, b) => b.dailyRevenue - a.dailyRevenue);
      return deduped;
    }

        function updateSunrisePick() {
      const results = calculateSunrisePick();
      const container = document.getElementById('sunrise-pick');
      if (!container || results.length === 0) return;

      const winner = results[0];

      // Winner (Hot Pick)
      const coinEl = document.getElementById('sunrise-coin');
      const revEl = document.getElementById('sunrise-revenue');
      const minerEl = document.getElementById('sunrise-miner');

      if (coinEl) coinEl.textContent = winner.coin;
      if (revEl) revEl.textContent = '$' + winner.dailyRevenue.toFixed(2) + '/day';
      if (minerEl) minerEl.textContent = 'with ' + winner.miner;

      // Ember Picks (everything else, highest to lowest $)
      const emberWrap = document.getElementById('ember-columns');
      if (emberWrap) {
        const ember = results.slice(1);

        // Split into two columns (top-to-bottom), then render side-by-side
        const mid = Math.ceil(ember.length / 2);
        const left = ember.slice(0, mid);
        const right = ember.slice(mid);

        const renderCol = (items) => {
          return `
            <div class="coins-col">
              ${items.map(item => `
                <div class="coin-row">
                  <div class="coin-left">
                    <div class="coin-name">${item.coin}</div>
                    <div class="coin-miner">${item.miner}</div>
                  </div>
                  <div class="coin-revenue">$${item.dailyRevenue.toFixed(2)}/day</div>
                </div>
              `).join('')}
            </div>
          `;
        };

        emberWrap.innerHTML = renderCol(left) + renderCol(right);
      }

      container.style.visibility = 'visible';
    }

    // Update Sunrise Pick after prices load
    setTimeout(updateSunrisePick, 2500);
    setInterval(updateSunrisePick, 60000);

    // ============================================
    // EVENT LISTENERS
    // ============================================
    document.getElementById('voltage-filter').addEventListener('change', updateMinerDropdown);
    document.getElementById('algorithm-filter').addEventListener('change', updateMinerDropdown);
    document.getElementById('miner-select').addEventListener('change', selectMiner);
    
    document.getElementById('solar-hours').addEventListener('input', updateTimeline);
    document.getElementById('free-hours').addEventListener('input', updateTimeline);
    document.getElementById('battery-hours').addEventListener('input', updateTimeline);
    document.getElementById('idle-hours').addEventListener('input', updateTimeline);
    document.getElementById('grid-rate').addEventListener('input', updateTimeline);
    
    // ============================================
    // INIT
    // ============================================
    updateMiningType(); // Initialize with ASIC mode
    updateTimeline();
    renderBrowseTable();
    initPrices(); // Fetch live prices on page load
    initMiningStats(); // Fetch live difficulty data on page load
    // Auto-refresh mining stats every 60 seconds — matches the price refresh and,
    // crucially, resets the data-age badge BEFORE it can ever tick over to "old".
    // Previously this fetched ONCE at load, so the "Xm old" badge just climbed.
    setInterval(fetchMiningStats, 60000);
    // All coins now fetched via /api/mining-stats direct APIs
    initPriceInput(); // Enable custom price input for what-if scenarios
    
    // Data-age badge: render once at init and tick every 15 seconds so the
    // displayed age increases over time even when no new fetch has happened.
    updateDataAgeBadge();
    setInterval(updateDataAgeBadge, 15000);

    // Pre-select miner if linked from miners.html catalog
    (function() {
      var params = new URLSearchParams(window.location.search);
      var minerId = params.get('miner');
      if (minerId) {
        var retired = window.SRE_RETIRED_MINERS || {};
        if (!ALL_MINERS.some(function (m) { return m.id === minerId; }) && retired[minerId]) {
          var note = document.createElement('div');
          note.id = 'retired-miner-msg';
          note.style.cssText = 'text-align:center;padding:1rem;margin:1rem 0;background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.25);border-radius:8px;color:#8899a8;';
          note.textContent = 'The ' + retired[minerId] + ' is no longer listed on SolaRayEffect.com. Pick a current miner below or browse the Miner Catalog.';
          var info = document.getElementById('miner-info');
          info.parentNode.insertBefore(note, info);
        } else {
          selectMinerFromTable(minerId);
        }
      }
    })();
