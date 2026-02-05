/* ═══════════════════════════════════════════════════════════════
   SOLA'S ARRAY — DATA VAULT CHART ENGINE
   solas-charts.js
   All chart logic, API calls, and data rendering for datavault.html
   Charts: 11 panels covering BTC network, market, and mining data
   APIs: Blockchain.com (free), CoinGecko (free tier)
   Charts: Chart.js with chartjs-adapter-date-fns
   ═══════════════════════════════════════════════════════════════ */

// ─── CHART.JS GLOBAL CONFIG ────────────────────────────────────
Chart.defaults.color = '#6b7d8f';
Chart.defaults.borderColor = '#1e2a38';
Chart.defaults.font.family = "'Share Tech Mono', monospace";

// ─── TERMINAL COLORS ───────────────────────────────────────────
const COLORS = {
  cyan:   '#00d4ff',
  green:  '#00ff88',
  amber:  '#ffb800',
  red:    '#ff3344',
  sand:   '#c4a574',
  muted:  '#6b7d8f',
  panel:  '#131920',
  border: '#1e2a38',
  dark:   '#0d1117'
};

// ─── DATA STORAGE ──────────────────────────────────────────────
const chartData = {
  hashrate:     { full: [], chart: null },
  difficulty:   { full: [], chart: null },
  price:        { full: [], chart: null },
  overlay:      { chart: null },
  adjustments:  { full: [], chart: null },
  mempool:      { full: [], chart: null },
  blocktime:    { full: [], chart: null },
  fees:         { full: [], chart: null },
  revenue:      { full: [], chart: null },
  hashprice:    { full: [], chart: null }
};

// ─── LOADING MESSAGES (Imperial flavor) ────────────────────────
const LOADING_MESSAGES = [
  'Accessing mainframe...',
  'Decrypting data...',
  'Syncing market data...',
  'Establishing uplink...',
  'Scanning network nodes...',
  'Compiling telemetry...',
  'Authenticating clearance...',
  'Retrieving archives...',
  'Calibrating sensors...',
  'Processing signal...',
  'Linking to relay station...'
];

// ─── BOOT SEQUENCE MESSAGES ────────────────────────────────────
const BOOT_MESSAGES = [
  'IMPERIAL DATA VAULT v4.7.7',
  'Initializing secure connection...',
  'Authenticating clearance level...',
  'Loading network telemetry...',
  'Establishing API uplinks...',
  'Decrypting data streams...',
  'Calibrating chart arrays...',
  'All systems operational.',
  'Welcome to Sola\'s Array.'
];


/* ================================================================
   SECTION 1: FORMATTING UTILITIES
   ================================================================ */

/**
 * Format hashrate from GH/s (Blockchain.com native unit)
 * into human-readable ZH/s, EH/s, PH/s, TH/s
 */
function formatHashrate(value) {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + ' ZH/s';
  if (value >= 1e9)  return (value / 1e9).toFixed(2) + ' EH/s';
  if (value >= 1e6)  return (value / 1e6).toFixed(2) + ' PH/s';
  if (value >= 1e3)  return (value / 1e3).toFixed(2) + ' TH/s';
  return value.toFixed(2) + ' GH/s';
}

function formatDifficulty(value) {
  if (value >= 1e12) return (value / 1e12).toFixed(2) + ' T';
  if (value >= 1e9)  return (value / 1e9).toFixed(2) + ' B';
  if (value >= 1e6)  return (value / 1e6).toFixed(2) + ' M';
  return value.toFixed(2);
}

function formatPrice(value) {
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPriceDecimal(value) {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(2) + '%';
}

function formatBytes(value) {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + ' GB';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + ' MB';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + ' KB';
  return value.toFixed(0) + ' B';
}

function formatMinutes(value) {
  return value.toFixed(1) + ' min';
}

function formatBTC(value) {
  return value.toFixed(2) + ' BTC';
}

function formatHashprice(value) {
  return '$' + value.toFixed(4) + '/TH/day';
}

function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}


/* ================================================================
   SECTION 2: DATA PROCESSING UTILITIES
   ================================================================ */

/**
 * Moving average smoothing
 * @param {Array} data - Array of {x, y} objects
 * @param {number} windowSize - Number of points to average
 * @returns {Array} Smoothed data array
 */
function smoothData(data, windowSize) {
  if (!data || data.length < windowSize) return data;

  const smoothed = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const avg = window.reduce((sum, d) => sum + d.y, 0) / window.length;
    smoothed.push({ x: data[i].x, y: avg });
  }
  return smoothed;
}

/**
 * Filter data to a specific number of days from now
 * @param {Array} data - Array of {x, y} with x in Unix seconds
 * @param {number} days - Number of days to include
 * @returns {Array} Filtered data
 */
function filterByDays(data, days) {
  const cutoff = Date.now() / 1000 - (days * 24 * 60 * 60);
  return data.filter(d => d.x >= cutoff);
}

/**
 * Calculate percentage change between two values
 */
function calcChange(current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Calculate difficulty adjustment percentages from raw difficulty data
 * Returns array of {x, y} where y is the % change at each adjustment
 */
function calcDifficultyAdjustments(diffData) {
  if (!diffData || diffData.length < 2) return [];

  const adjustments = [];
  let prevValue = diffData[0].y;

  for (let i = 1; i < diffData.length; i++) {
    const curr = diffData[i].y;
    // Difficulty only changes every ~2016 blocks (~14 days)
    // Detect change when value differs from previous
    if (curr !== prevValue) {
      const pctChange = ((curr - prevValue) / prevValue) * 100;
      adjustments.push({
        x: diffData[i].x,
        y: pctChange
      });
      prevValue = curr;
    }
  }
  return adjustments;
}

/**
 * Calculate hashprice: (daily BTC revenue * BTC price) / network hashrate in TH/s
 * hashprice = $/TH/day
 */
function calcHashprice(revenueData, priceData, hashrateData) {
  if (!revenueData?.length || !priceData?.length || !hashrateData?.length) return [];

  const hashprice = [];
  // Build a price lookup by day (rounded to day)
  const priceLookup = {};
  priceData.forEach(p => {
    const dayKey = Math.floor(p.x / 86400);
    priceLookup[dayKey] = p.y;
  });

  const hashrateLookup = {};
  hashrateData.forEach(h => {
    const dayKey = Math.floor(h.x / 86400);
    hashrateLookup[dayKey] = h.y;
  });

  revenueData.forEach(r => {
    const dayKey = Math.floor(r.x / 86400);
    const price = priceLookup[dayKey];
    const hashrate = hashrateLookup[dayKey];

    if (price && hashrate && hashrate > 0) {
      // Revenue is in BTC, hashrate is in GH/s from Blockchain.com
      // Convert hashrate from GH/s to TH/s: divide by 1000
      const hashrateTH = hashrate * 1000; // GH/s * 1000 = TH/s — wait, no
      // Actually: 1 TH/s = 1000 GH/s, so TH/s = GH/s / 1000
      const hashrateTHs = hashrate / 1000;
      // But network hashrate is enormous, we need per-TH share
      // hashprice = (daily_revenue_btc * btc_price) / (network_hashrate_in_TH)
      const dailyRevenueUSD = r.y * price;
      const hp = dailyRevenueUSD / hashrateTHs;
      if (isFinite(hp) && hp > 0) {
        hashprice.push({ x: r.x, y: hp });
      }
    }
  });

  return hashprice;
}


/* ================================================================
   SECTION 3: CHART CREATION
   ================================================================ */

/**
 * Create a standard single-dataset line chart with terminal styling
 */
function createChart(canvasId, data, label, color, formatFn, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas #${canvasId} not found`);
    return null;
  }

  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '00');

  const chartType = options.type || 'line';

  const config = {
    type: chartType,
    data: {
      labels: data.map(d => new Date(d.x * 1000)),
      datasets: [{
        label: label,
        data: data.map(d => d.y),
        borderColor: color,
        backgroundColor: chartType === 'bar' ? color + '80' : gradient,
        borderWidth: chartType === 'bar' ? 0 : 2,
        fill: chartType !== 'bar',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        barPercentage: options.barPercentage || 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.panel,
          borderColor: color,
          borderWidth: 1,
          titleFont: { family: "'Orbitron', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          padding: 12,
          displayColors: false,
          callbacks: {
            title: function(context) {
              return new Date(context[0].parsed.x).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              });
            },
            label: function(context) {
              return formatFn(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: options.timeUnit || 'month',
            displayFormats: { month: 'MMM yyyy', week: 'MMM d', day: 'MMM d' }
          },
          grid: { color: COLORS.border, drawBorder: false },
          ticks: { maxTicksLimit: options.maxXTicks || 6 }
        },
        y: {
          grid: { color: COLORS.border, drawBorder: false },
          ticks: {
            callback: function(value) { return formatFn(value); },
            maxTicksLimit: options.maxYTicks || 5
          },
          ...(options.yMin !== undefined && { min: options.yMin })
        }
      }
    }
  };

  return new Chart(ctx, config);
}

/**
 * Create dual-axis overlay chart (hashrate + price)
 */
function createOverlayChart(canvasId, hashrateData, priceData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas #${canvasId} not found`);
    return null;
  }

  const ctx = canvas.getContext('2d');

  const gradientCyan = ctx.createLinearGradient(0, 0, 0, 280);
  gradientCyan.addColorStop(0, COLORS.cyan + '25');
  gradientCyan.addColorStop(1, COLORS.cyan + '00');

  const gradientAmber = ctx.createLinearGradient(0, 0, 0, 280);
  gradientAmber.addColorStop(0, COLORS.amber + '25');
  gradientAmber.addColorStop(1, COLORS.amber + '00');

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: hashrateData.map(d => new Date(d.x * 1000)),
      datasets: [
        {
          label: 'Hashrate',
          data: hashrateData.map(d => d.y),
          borderColor: COLORS.cyan,
          backgroundColor: gradientCyan,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'yHashrate'
        },
        {
          label: 'Price',
          data: priceData.map(d => d.y),
          borderColor: COLORS.amber,
          backgroundColor: gradientAmber,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'yPrice'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: COLORS.muted,
            font: { family: "'Share Tech Mono', monospace", size: 11 },
            boxWidth: 12,
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: COLORS.panel,
          borderColor: COLORS.muted,
          borderWidth: 1,
          titleFont: { family: "'Orbitron', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          padding: 12,
          callbacks: {
            title: function(context) {
              return new Date(context[0].parsed.x).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              });
            },
            label: function(context) {
              if (context.datasetIndex === 0) return 'Hashrate: ' + formatHashrate(context.raw);
              return 'Price: ' + formatPrice(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
          grid: { color: COLORS.border, drawBorder: false },
          ticks: { maxTicksLimit: 6 }
        },
        yHashrate: {
          position: 'left',
          grid: { color: COLORS.border, drawBorder: false },
          ticks: {
            callback: function(val) { return formatHashrate(val); },
            maxTicksLimit: 5,
            color: COLORS.cyan + 'aa'
          }
        },
        yPrice: {
          position: 'right',
          grid: { drawOnChartArea: false, drawBorder: false },
          ticks: {
            callback: function(val) { return formatPrice(val); },
            maxTicksLimit: 5,
            color: COLORS.amber + 'aa'
          }
        }
      }
    }
  });
}

/**
 * Create bar chart for difficulty adjustments with color-coded bars
 */
function createAdjustmentsChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas #${canvasId} not found`);
    return null;
  }

  const ctx = canvas.getContext('2d');

  // Color bars green for positive, red for negative
  const barColors = data.map(d => d.y >= 0 ? COLORS.green + 'cc' : COLORS.red + 'cc');
  const borderColors = data.map(d => d.y >= 0 ? COLORS.green : COLORS.red);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => new Date(d.x * 1000)),
      datasets: [{
        label: 'Difficulty Change',
        data: data.map(d => d.y),
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.panel,
          borderColor: COLORS.green,
          borderWidth: 1,
          titleFont: { family: "'Orbitron', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          padding: 12,
          displayColors: false,
          callbacks: {
            title: function(context) {
              return new Date(context[0].parsed.x).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              });
            },
            label: function(context) {
              return formatPercent(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
          grid: { color: COLORS.border, drawBorder: false },
          ticks: { maxTicksLimit: 6 }
        },
        y: {
          grid: { color: COLORS.border, drawBorder: false },
          ticks: {
            callback: function(val) { return formatPercent(val); },
            maxTicksLimit: 5
          }
        }
      }
    }
  });
}


/* ================================================================
   SECTION 4: CHART UPDATE / TIME RANGE FILTERING
   ================================================================ */

/**
 * Update a standard chart with filtered time range
 */
function updateChartRange(chartType, days) {
  const store = chartData[chartType];
  if (!store || !store.full.length || !store.chart) return;

  let filtered = filterByDays(store.full, days);

  // Apply smoothing per chart type
  if (chartType === 'hashrate')  filtered = smoothData(filtered, 7);
  if (chartType === 'price')     filtered = smoothData(filtered, 3);
  if (chartType === 'mempool')   filtered = smoothData(filtered, 3);
  if (chartType === 'blocktime') filtered = smoothData(filtered, 3);
  if (chartType === 'fees')      filtered = smoothData(filtered, 3);
  if (chartType === 'revenue')   filtered = smoothData(filtered, 3);
  if (chartType === 'hashprice') filtered = smoothData(filtered, 7);

  store.chart.data.labels = filtered.map(d => new Date(d.x * 1000));
  store.chart.data.datasets[0].data = filtered.map(d => d.y);
  store.chart.update('none');
}

/**
 * Update overlay chart (hashrate vs price) with time range
 */
function updateOverlayRange(days) {
  const chart = chartData.overlay.chart;
  if (!chart) return;

  const hData = smoothData(filterByDays(chartData.hashrate.full, days), 7);
  const pData = smoothData(filterByDays(chartData.price.full, days), 3);

  // Use hashrate timestamps as primary
  chart.data.labels = hData.map(d => new Date(d.x * 1000));
  chart.data.datasets[0].data = hData.map(d => d.y);
  chart.data.datasets[1].data = pData.map(d => d.y);
  chart.update('none');
}

/**
 * Update difficulty adjustments bar chart with time range
 */
function updateAdjustmentsRange(days) {
  const store = chartData.adjustments;
  if (!store.full.length || !store.chart) return;

  const filtered = filterByDays(store.full, days);

  // Recalculate bar colors
  const barColors = filtered.map(d => d.y >= 0 ? COLORS.green + 'cc' : COLORS.red + 'cc');
  const borderColors = filtered.map(d => d.y >= 0 ? COLORS.green : COLORS.red);

  store.chart.data.labels = filtered.map(d => new Date(d.x * 1000));
  store.chart.data.datasets[0].data = filtered.map(d => d.y);
  store.chart.data.datasets[0].backgroundColor = barColors;
  store.chart.data.datasets[0].borderColor = borderColors;
  store.chart.update('none');
}


/* ================================================================
   SECTION 5: API FETCH FUNCTIONS
   ================================================================ */

/**
 * Fetch data from Blockchain.com Charts API
 * @param {string} chartName - Key in chartData
 * @param {string} endpoint - Blockchain.com chart endpoint name
 * @param {string} timespan - e.g. '1year', '2years'
 * @returns {Array|null} - Array of {x, y} objects
 */
async function fetchBlockchainData(chartName, endpoint, timespan = '1year') {
  const loadingEl = document.getElementById(`${chartName}-loading`);

  try {
    const url = `https://api.blockchain.info/charts/${endpoint}?timespan=${timespan}&format=json&cors=true`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Blockchain API ${endpoint} returned ${response.status}`);

    const data = await response.json();
    chartData[chartName].full = data.values;

    if (loadingEl) loadingEl.style.display = 'none';
    return data.values;

  } catch (error) {
    console.error(`Error fetching ${chartName} (${endpoint}):`, error);
    showFetchError(loadingEl);
    return null;
  }
}

/**
 * Fetch BTC price history from CoinGecko
 * @param {number} days - Number of days of history
 * @returns {Array|null} - Array of {x, y} with x in Unix seconds
 */
async function fetchPriceData(days = 365) {
  const loadingEl = document.getElementById('price-loading');

  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);

    const data = await response.json();

    // Convert from [timestamp_ms, price] to {x: unix_seconds, y: price}
    const formatted = data.prices.map(p => ({
      x: p[0] / 1000,
      y: p[1]
    }));

    chartData.price.full = formatted;

    if (loadingEl) loadingEl.style.display = 'none';
    return formatted;

  } catch (error) {
    console.error('Error fetching price:', error);
    showFetchError(loadingEl);
    return null;
  }
}

/**
 * Show connection error in a loading overlay
 */
function showFetchError(loadingEl) {
  if (loadingEl) {
    loadingEl.innerHTML = `
      <div class="error-message">
        <p>[ CONNECTION FAILED ]</p>
        <p style="margin-top: 10px; font-size: 0.7rem;">Unable to establish link to data source</p>
      </div>
    `;
  }
}


/* ================================================================
   SECTION 6: STATS DISPLAY UPDATES
   ================================================================ */

/**
 * Safely set text content of an element by ID
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * Set text and add color class based on positive/negative
 */
function setChangeText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = formatPercent(value);
  el.className = 'stat-value ' + (value >= 0 ? 'green' : 'red');
}

/**
 * Update stats bar beneath each chart
 */
function updateStats(type, data) {
  if (!data || !data.length) return;

  const current = data[data.length - 1].y;
  const thirtyDaysAgo = data.find(d => d.x >= (Date.now() / 1000) - (30 * 86400))?.y || data[0].y;
  const change30d = calcChange(current, thirtyDaysAgo);
  const ath = Math.max(...data.map(d => d.y));
  const atl = Math.min(...data.map(d => d.y));

  switch (type) {
    case 'hashrate':
      setText('hashrate-current', formatHashrate(current));
      setChangeText('hashrate-change', change30d);
      setText('hashrate-ath', formatHashrate(ath));
      break;

    case 'difficulty':
      setText('difficulty-current', formatDifficulty(current));
      // Calculate estimated next adjustment from recent trend
      updateDifficultyEstimates(data);
      break;

    case 'price':
      setText('price-current', formatPrice(current));
      setChangeText('price-change', change30d);
      setText('price-ath', formatPrice(ath));
      break;

    case 'overlay':
      // Overlay uses correlation stat
      if (chartData.hashrate.full.length && chartData.price.full.length) {
        const hChange = calcChange(
          chartData.hashrate.full[chartData.hashrate.full.length - 1].y,
          chartData.hashrate.full.find(d => d.x >= (Date.now() / 1000) - (30 * 86400))?.y || chartData.hashrate.full[0].y
        );
        const pChange = calcChange(
          chartData.price.full[chartData.price.full.length - 1].y,
          chartData.price.full.find(d => d.x >= (Date.now() / 1000) - (30 * 86400))?.y || chartData.price.full[0].y
        );
        setText('overlay-hashrate', formatHashrate(chartData.hashrate.full[chartData.hashrate.full.length - 1].y));
        setText('overlay-price', formatPrice(chartData.price.full[chartData.price.full.length - 1].y));
        // Simple correlation indicator
        const sameDirection = (hChange >= 0 && pChange >= 0) || (hChange < 0 && pChange < 0);
        setText('overlay-correlation', sameDirection ? 'ALIGNED' : 'DIVERGING');
        const corrEl = document.getElementById('overlay-correlation');
        if (corrEl) corrEl.className = 'stat-value ' + (sameDirection ? 'green' : 'amber');
      }
      break;

    case 'adjustments':
      if (data.length > 0) {
        const lastAdj = data[data.length - 1];
        setText('adj-last', formatPercent(lastAdj.y));
        const lastEl = document.getElementById('adj-last');
        if (lastEl) lastEl.className = 'stat-value ' + (lastAdj.y >= 0 ? 'green' : 'red');

        const positives = data.filter(d => d.y > 0).length;
        const total = data.length;
        setText('adj-positive', `${positives}/${total}`);

        const avg = data.reduce((sum, d) => sum + d.y, 0) / data.length;
        setText('adj-avg', formatPercent(avg));
      }
      break;

    case 'mempool':
      setText('mempool-current', formatBytes(current));
      setChangeText('mempool-change', change30d);
      setText('mempool-peak', formatBytes(ath));
      break;

    case 'blocktime':
      setText('blocktime-current', formatMinutes(current));
      setText('blocktime-target', '10.0 min');
      const deviation = ((current - 10) / 10) * 100;
      setText('blocktime-deviation', formatPercent(deviation));
      const devEl = document.getElementById('blocktime-deviation');
      if (devEl) devEl.className = 'stat-value ' + (Math.abs(deviation) < 5 ? 'green' : 'amber');
      break;

    case 'fees':
      setText('fees-current', formatPriceDecimal(current));
      setChangeText('fees-change', change30d);
      setText('fees-peak', formatPriceDecimal(ath));
      break;

    case 'revenue':
      setText('revenue-current', formatPrice(current));
      setChangeText('revenue-change', change30d);
      setText('revenue-avg', formatPrice(data.reduce((s, d) => s + d.y, 0) / data.length));
      break;

    case 'hashprice':
      setText('hashprice-current', formatHashprice(current));
      setChangeText('hashprice-change', change30d);
      setText('hashprice-low', formatHashprice(atl));
      break;
  }
}

/**
 * Estimate next difficulty adjustment and time remaining
 */
function updateDifficultyEstimates(diffData) {
  if (!diffData || diffData.length < 2) return;

  // Find the last two distinct difficulty values to calculate recency
  let lastChangeIndex = diffData.length - 1;
  const currentDiff = diffData[lastChangeIndex].y;

  // Walk backwards to find when difficulty last changed
  for (let i = diffData.length - 2; i >= 0; i--) {
    if (diffData[i].y !== currentDiff) {
      lastChangeIndex = i + 1;
      break;
    }
  }

  const lastChangeTime = diffData[lastChangeIndex].x;
  const daysSinceChange = (Date.now() / 1000 - lastChangeTime) / 86400;
  const daysRemaining = Math.max(0, 14 - daysSinceChange);

  setText('difficulty-next', daysRemaining < 1 ? 'IMMINENT' : `~${Math.round(daysRemaining)} days`);

  // Estimate change based on hashrate trend (if available)
  if (chartData.hashrate.full.length > 0) {
    const hrData = chartData.hashrate.full;
    const recentHR = hrData[hrData.length - 1].y;
    const twoWeeksAgoHR = hrData.find(d => d.x >= (Date.now() / 1000) - (14 * 86400))?.y || hrData[0].y;
    const hrChange = calcChange(recentHR, twoWeeksAgoHR);
    setText('difficulty-est', formatPercent(hrChange));
    const estEl = document.getElementById('difficulty-est');
    if (estEl) estEl.className = 'stat-value ' + (hrChange >= 0 ? 'amber' : 'green');
  }
}


/* ================================================================
   SECTION 7: HALVING COUNTDOWN
   ================================================================ */

/**
 * Calculate and display halving countdown
 * Next halving: Block 1,050,000 (after April 2024 halving at 840,000)
 * ~210,000 blocks between halvings
 * Average block time: ~10 minutes
 */
async function initHalvingCountdown() {
  const loadingEl = document.getElementById('halving-loading');

  try {
    // Fetch current block height from Blockchain.com
    const response = await fetch('https://api.blockchain.info/q/getblockcount?cors=true');
    if (!response.ok) throw new Error('Failed to fetch block height');

    const currentBlock = await response.json();
    const nextHalvingBlock = 1050000;
    const blocksRemaining = nextHalvingBlock - currentBlock;
    const totalBlocksInEpoch = 210000;
    const blocksSinceHalving = currentBlock - 840000; // Since April 2024 halving

    // Estimate time remaining (avg 10 min per block)
    const minutesRemaining = blocksRemaining * 10;
    const estimatedDate = new Date(Date.now() + minutesRemaining * 60 * 1000);

    // Calculate days, hours, minutes
    const days = Math.floor(minutesRemaining / 1440);
    const hours = Math.floor((minutesRemaining % 1440) / 60);
    const mins = Math.floor(minutesRemaining % 60);

    // Update countdown display
    setText('countdown-days', String(days).padStart(3, '0'));
    setText('countdown-hours', String(hours).padStart(2, '0'));
    setText('countdown-minutes', String(mins).padStart(2, '0'));

    // Update stats
    setText('halving-block', formatNumber(nextHalvingBlock));
    setText('halving-current', formatNumber(currentBlock));
    setText('halving-remaining', formatNumber(blocksRemaining));
    setText('halving-estimate', estimatedDate.toLocaleDateString('en-US', {
      month: 'short', year: 'numeric'
    }));

    // Progress bar
    const progress = (blocksSinceHalving / totalBlocksInEpoch) * 100;
    const progressBar = document.getElementById('halving-progress-fill');
    if (progressBar) {
      progressBar.style.width = Math.min(progress, 100).toFixed(1) + '%';
    }
    setText('halving-progress-text', progress.toFixed(1) + '% through current epoch');

    // Reward info
    setText('halving-reward-current', '3.125 BTC');
    setText('halving-reward-next', '1.5625 BTC');

    if (loadingEl) loadingEl.style.display = 'none';

  } catch (error) {
    console.error('Error fetching halving data:', error);
    showFetchError(loadingEl);
  }
}


/* ================================================================
   SECTION 8: BOOT SEQUENCE ANIMATION
   ================================================================ */

/**
 * Run the Imperial boot sequence animation
 * Fills progress bar and cycles through boot messages
 */
function runBootSequence() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('boot-overlay');
    const progressFill = document.getElementById('boot-progress-fill');
    const bootText = document.getElementById('boot-text');

    if (!overlay) {
      resolve();
      return;
    }

    let progress = 0;
    let messageIndex = 0;

    const interval = setInterval(() => {
      progress += Math.random() * 8 + 2; // Random increments for realism
      if (progress > 100) progress = 100;

      if (progressFill) progressFill.style.width = progress + '%';

      // Cycle boot messages
      if (progress > (messageIndex + 1) * (100 / BOOT_MESSAGES.length)) {
        messageIndex = Math.min(messageIndex + 1, BOOT_MESSAGES.length - 1);
        if (bootText) bootText.textContent = BOOT_MESSAGES[messageIndex];
      }

      if (progress >= 100) {
        clearInterval(interval);
        // Fade out boot screen
        setTimeout(() => {
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.8s ease';
          setTimeout(() => {
            overlay.style.display = 'none';
            resolve();
          }, 800);
        }, 400);
      }
    }, 120);
  });
}


/* ================================================================
   SECTION 9: DATA REFRESH
   ================================================================ */

/**
 * Refresh all data and update charts
 */
async function refreshAllData() {
  const refreshBtn = document.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'REFRESHING...';
  }

  try {
    await loadAllData();
    updateRefreshTimestamp();
  } catch (error) {
    console.error('Refresh error:', error);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'REFRESH DATA';
    }
  }
}

/**
 * Update the last-refreshed timestamp display
 */
function updateRefreshTimestamp() {
  const timestampEl = document.querySelector('.refresh-timestamp');
  if (timestampEl) {
    const now = new Date();
    timestampEl.textContent = 'Last sync: ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
}


/* ================================================================
   SECTION 10: MASTER DATA LOADER
   ================================================================ */

/**
 * Load all data from APIs and build/update all charts
 */
async function loadAllData() {
  // ── Wave 1: Core data (hashrate, difficulty, price) ──────────
  // These are needed by other charts (overlay, hashprice)
  const [hashrateData, difficultyData, priceData] = await Promise.all([
    fetchBlockchainData('hashrate', 'hash-rate'),
    fetchBlockchainData('difficulty', 'difficulty'),
    fetchPriceData()
  ]);

  // ── Wave 2: Secondary data (mempool, blocktime, fees, revenue) ──
  const [mempoolData, blocktimeData, feesData, revenueData] = await Promise.all([
    fetchBlockchainData('mempool', 'mempool-size'),
    fetchBlockchainData('blocktime', 'median-confirmation-time'),
    fetchBlockchainData('fees', 'transaction-fees-usd'),
    fetchBlockchainData('revenue', 'miners-revenue')
  ]);

  // ── Build Charts ─────────────────────────────────────────────

  // 1. Hashrate
  if (hashrateData) {
    destroyChart('hashrate');
    const smoothed = smoothData(hashrateData, 7);
    chartData.hashrate.chart = createChart('hashrate-chart', smoothed, 'Hashrate', COLORS.cyan, formatHashrate);
    updateStats('hashrate', hashrateData);
  }

  // 2. Difficulty
  if (difficultyData) {
    destroyChart('difficulty');
    chartData.difficulty.chart = createChart('difficulty-chart', difficultyData, 'Difficulty', COLORS.green, formatDifficulty);
    updateStats('difficulty', difficultyData);
  }

  // 3. Price
  if (priceData) {
    destroyChart('price');
    const smoothed = smoothData(priceData, 3);
    chartData.price.chart = createChart('price-chart', smoothed, 'Price', COLORS.amber, formatPrice);
    updateStats('price', priceData);
  }

  // 4. Hashrate vs Price Overlay
  if (hashrateData && priceData) {
    if (chartData.overlay.chart) chartData.overlay.chart.destroy();
    const hSmoothed = smoothData(hashrateData, 7);
    const pSmoothed = smoothData(priceData, 3);
    chartData.overlay.chart = createOverlayChart('overlay-chart', hSmoothed, pSmoothed);
    updateStats('overlay', null);
    const overlayLoading = document.getElementById('overlay-loading');
    if (overlayLoading) overlayLoading.style.display = 'none';
  }

  // 5. Difficulty Adjustments
  if (difficultyData) {
    destroyChart('adjustments');
    const adjustments = calcDifficultyAdjustments(difficultyData);
    chartData.adjustments.full = adjustments;
    chartData.adjustments.chart = createAdjustmentsChart('adjustments-chart', adjustments);
    updateStats('adjustments', adjustments);
    const adjLoading = document.getElementById('adjustments-loading');
    if (adjLoading) adjLoading.style.display = 'none';
  }

  // 6. Mempool
  if (mempoolData) {
    destroyChart('mempool');
    const smoothed = smoothData(mempoolData, 3);
    chartData.mempool.chart = createChart('mempool-chart', smoothed, 'Mempool Size', COLORS.sand, formatBytes);
    updateStats('mempool', mempoolData);
  }

  // 7. Block Time
  if (blocktimeData) {
    destroyChart('blocktime');
    const smoothed = smoothData(blocktimeData, 3);
    chartData.blocktime.chart = createChart('blocktime-chart', smoothed, 'Block Time', COLORS.cyan, formatMinutes, {
      yMin: 0
    });
    updateStats('blocktime', blocktimeData);
  }

  // 8. Transaction Fees
  if (feesData) {
    destroyChart('fees');
    // Convert total daily fees to average fee per transaction
    // We'll keep it as total daily fees in USD for clarity
    const smoothed = smoothData(feesData, 3);
    chartData.fees.chart = createChart('fees-chart', smoothed, 'Daily Fees (USD)', COLORS.amber, formatPrice);
    updateStats('fees', feesData);
  }

  // 9. Miner Revenue (USD from Blockchain.com)
  if (revenueData) {
    destroyChart('revenue');
    const smoothed = smoothData(revenueData, 3);
    chartData.revenue.chart = createChart('revenue-chart', smoothed, 'Miner Revenue (USD)', COLORS.green, formatPrice);
    updateStats('revenue', revenueData);
  }

  // 10. Hashprice
  if (revenueData && priceData && hashrateData) {
    destroyChart('hashprice');
    // Calculate hashprice from miner revenue (USD), and network hashrate
    // hashprice = daily_revenue_usd / network_hashrate_TH
    const hashpriceValues = [];
    const hrLookup = {};
    hashrateData.forEach(h => {
      hrLookup[Math.floor(h.x / 86400)] = h.y;
    });

    revenueData.forEach(r => {
      const dayKey = Math.floor(r.x / 86400);
      const hr = hrLookup[dayKey];
      if (hr && hr > 0) {
        // Revenue is in USD (from miners-revenue endpoint)
        // Hashrate from API is in GH/s. Convert to TH/s: GH/s / 1000
        const hashrateTH = hr / 1000;
        const hp = r.y / hashrateTH;
        if (isFinite(hp) && hp > 0) {
          hashpriceValues.push({ x: r.x, y: hp });
        }
      }
    });

    chartData.hashprice.full = hashpriceValues;
    const smoothed = smoothData(hashpriceValues, 7);
    chartData.hashprice.chart = createChart('hashprice-chart', smoothed, 'Hashprice', COLORS.red, formatHashprice);
    updateStats('hashprice', hashpriceValues);
    const hpLoading = document.getElementById('hashprice-loading');
    if (hpLoading) hpLoading.style.display = 'none';
  }

  // 11. Halving Countdown (non-chart panel)
  await initHalvingCountdown();

  // Update refresh timestamp
  updateRefreshTimestamp();
}

/**
 * Safely destroy a chart before rebuilding
 */
function destroyChart(name) {
  if (chartData[name] && chartData[name].chart) {
    chartData[name].chart.destroy();
    chartData[name].chart = null;
  }
}


/* ================================================================
   SECTION 11: EVENT LISTENERS
   ================================================================ */

/**
 * Set up time range toggle buttons for all charts
 */
function initTimeButtons() {
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const chartName = this.dataset.chart;
      const range = parseInt(this.dataset.range);

      // Update active state within this group
      this.parentElement.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      // Route to correct update function
      if (chartName === 'overlay') {
        updateOverlayRange(range);
      } else if (chartName === 'adjustments') {
        updateAdjustmentsRange(range);
      } else {
        updateChartRange(chartName, range);
      }
    });
  });
}

/**
 * Set up refresh button
 */
function initRefreshButton() {
  const refreshBtn = document.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAllData);
  }
}


/* ================================================================
   SECTION 12: INITIALIZATION
   ================================================================ */

/**
 * Master init — runs on page load
 * 1. Boot sequence animation
 * 2. Load all data
 * 3. Set up event listeners
 */
async function init() {
  // Run boot sequence first
  await runBootSequence();

  // Load all chart data
  await loadAllData();

  // Set up interactions
  initTimeButtons();
  initRefreshButton();
}

// ─── START ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
