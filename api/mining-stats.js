// Vercel Serverless Function: /api/mining-stats.js
// Fetches live mining difficulty/hashrate data with 48-hour caching

// In-memory cache (resets on cold start, but that's fine for 48h cache)
let cache = {};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { coin, refresh } = req.query;
  const CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours in ms
  
  // If no coin specified, return all cached data or fetch all
  const coinsToFetch = coin ? [coin.toUpperCase()] : ['BTC', 'LTC', 'DOGE', 'KAS', 'BCH', 'DASH', 'ETC', 'RVN', 'ERG', 'ZEC', 'XMR', 'CKB', 'DGB'];
  
  const results = {};
  
  for (const c of coinsToFetch) {
    // Check cache first (unless refresh=true)
    if (!refresh && cache[c] && (Date.now() - cache[c].timestamp < CACHE_DURATION)) {
      results[c] = { ...cache[c], fromCache: true };
      continue;
    }
    
    // Fetch fresh data
    try {
      const data = await fetchCoinData(c);
      cache[c] = { ...data, timestamp: Date.now() };
      results[c] = { ...data, fromCache: false };
    } catch (error) {
      console.error(`Error fetching ${c}:`, error.message);
      // Return cached data if available, even if expired
      if (cache[c]) {
        results[c] = { ...cache[c], fromCache: true, stale: true };
      } else {
        results[c] = { error: error.message };
      }
    }
  }
  
  return res.status(200).json({
    success: true,
    cache_duration_hours: 48,
    data: coin ? results[coin.toUpperCase()] : results
  });
}

async function fetchCoinData(coin) {
  const NOWNODES_KEY = process.env.NOWNODES_API_KEY;
  
  switch (coin) {
    case 'BTC':
      return await fetchBTC();
    case 'KAS':
      return await fetchKAS();
    case 'ERG':
      return await fetchERG();
    case 'ZEC':
      return await fetchZEC();
    case 'XMR':
      return await fetchXMR();
    case 'CKB':
      return await fetchCKB();
    case 'DGB':
      return await fetchDGB();
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'RVN':
      return await fetchViaNowNodes(coin, NOWNODES_KEY);
    case 'ETC':
      return await fetchETC();
    default:
      throw new Error(`Unsupported coin: ${coin}`);
  }
}

// BTC via blockchain.info (no API key needed)
async function fetchBTC() {
  const [diffRes, heightRes] = await Promise.all([
    fetch('https://blockchain.info/q/getdifficulty'),
    fetch('https://blockchain.info/q/getblockcount')
  ]);
  
  const difficulty = parseFloat(await diffRes.text());
  const height = parseInt(await heightRes.text());
  
  // Calculate network hashrate from difficulty
  // hashrate = difficulty * 2^32 / block_time
  const networkHashrate = (difficulty * Math.pow(2, 32)) / 600;
  
  return {
    coin: 'BTC',
    difficulty,
    network_hashrate: networkHashrate,
    height,
    block_reward: 3.125,
    block_time: 600,
    timestamp: Date.now(),
    source: 'blockchain.info'
  };
}

// KAS via Kaspa API (no API key needed)
async function fetchKAS() {
  const res = await fetch('https://api.kaspa.org/info/network');
  const data = await res.json();
  
  return {
    coin: 'KAS',
    difficulty: data.difficulty || 0,
    network_hashrate: data.hashrate || 0,
    height: data.blockCount || 0,
    block_reward: 50, // Approximate, decreases over time
    block_time: 1, // 1 second blocks
    timestamp: Date.now(),
    source: 'api.kaspa.org'
  };
}

// ERG via Ergo Platform API (no API key needed)
async function fetchERG() {
  const res = await fetch('https://api.ergoplatform.com/api/v1/networkState');
  const data = await res.json();
  
  return {
    coin: 'ERG',
    difficulty: data.difficulty || 0,
    network_hashrate: (data.difficulty || 0) / 1.5, // Approximate
    height: data.height || 0,
    block_reward: 27, // Current emission
    block_time: 120, // 2 minutes
    timestamp: Date.now(),
    source: 'ergoplatform.com'
  };
}

// ZEC via Blockchair (no API key needed)
async function fetchZEC() {
  const res = await fetch('https://api.blockchair.com/zcash/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'ZEC',
    difficulty: data.difficulty || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 2.5, // Post-halving
    block_time: 75, // ~75 seconds
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// XMR via Blockchair (no API key needed)
// Note: XMR uses RandomX, hashrate = difficulty / block_time (NOT * 2^32)
async function fetchXMR() {
  const res = await fetch('https://api.blockchair.com/monero/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'XMR',
    difficulty: parseFloat(data.difficulty) || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 0.6, // Tail emission ~0.6 XMR
    block_time: 120, // 2 minutes
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// CKB via Nervos Explorer API (no API key needed, requires vnd.api+json header)
async function fetchCKB() {
  const res = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics', {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    }
  });
  const json = await res.json();
  const attrs = json.data?.attributes || {};
  
  const hashRate = parseFloat(attrs.hash_rate) || 0;
  const difficulty = parseFloat(attrs.current_epoch_difficulty) || 0;
  const height = parseInt(attrs.tip_block_number) || 0;
  const avgBlockTime = parseFloat(attrs.average_block_time) || 8000; // in milliseconds
  
  return {
    coin: 'CKB',
    difficulty,
    network_hashrate: hashRate, // Already in H/s
    hash_rate: hashRate,
    height,
    block_reward: 500, // Base issuance per block (approximate)
    block_time: avgBlockTime / 1000, // Convert ms to seconds
    timestamp: Date.now(),
    source: 'explorer.nervos.org'
  };
}

// DGB via chainz.cryptoid.info (no API key needed for basic queries)
// Makes 3 separate calls for difficulty, hashrate, and block height
async function fetchDGB() {
  const [diffRes, hashRes, heightRes] = await Promise.all([
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getdifficulty'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=nethashps'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getblockcount')
  ]);
  
  const difficulty = parseFloat(await diffRes.text()) || 0;
  const networkHashrate = parseFloat(await hashRes.text()) || 0;
  const height = parseInt(await heightRes.text()) || 0;
  
  return {
    coin: 'DGB',
    difficulty,
    network_hashrate: networkHashrate, // In H/s
    height,
    block_reward: 665, // Approximate current reward
    block_time: 15, // 15 seconds
    timestamp: Date.now(),
    source: 'chainz.cryptoid.info'
  };
}

// ETC via public RPC
async function fetchETC() {
  const res = await fetch('https://etc.etcdesktop.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1
    })
  });
  
  const data = await res.json();
  const difficulty = parseInt(data.result?.difficulty || '0', 16);
  const height = parseInt(data.result?.number || '0', 16);
  
  return {
    coin: 'ETC',
    difficulty,
    network_hashrate: difficulty / 14, // Approximate
    height,
    block_reward: 2.56,
    block_time: 14,
    timestamp: Date.now(),
    source: 'etc.etcdesktop.com'
  };
}

// Fetch via NOWNodes (LTC, DOGE, BCH, DASH, RVN)
async function fetchViaNowNodes(coin, apiKey) {
  if (!apiKey) {
    throw new Error('NOWNodes API key not configured');
  }
  
  const endpoints = {
    LTC: 'https://ltcbook.nownodes.io/api/v2',
    DOGE: 'https://dogebook.nownodes.io/api/v2',
    BCH: 'https://bchbook.nownodes.io/api/v2',
    DASH: 'https://dashbook.nownodes.io/api/v2',
    RVN: 'https://rvnbook.nownodes.io/api/v2'
  };
  
  const blockRewards = {
    LTC: 6.25,
    DOGE: 10000,
    BCH: 3.125,
    DASH: 0.44,
    RVN: 2500
  };
  
  const blockTimes = {
    LTC: 150, // 2.5 minutes
    DOGE: 60, // 1 minute
    BCH: 600, // 10 minutes
    DASH: 150, // 2.5 minutes
    RVN: 60 // 1 minute
  };
  
  const baseUrl = endpoints[coin];
  if (!baseUrl) throw new Error(`No endpoint for ${coin}`);
  
  const res = await fetch(baseUrl, {
    headers: { 'api-key': apiKey }
  });
  
  const data = await res.json();
  
  // NOWNodes blockbook returns backend info with difficulty
  const difficulty = parseFloat(data.backend?.difficulty || data.difficulty || 0);
  const height = parseInt(data.backend?.blocks || data.blockbook?.bestHeight || 0);
  
  // Estimate hashrate from difficulty
  const blockTime = blockTimes[coin] || 60;
  const networkHashrate = (difficulty * Math.pow(2, 32)) / blockTime;
  
  return {
    coin,
    difficulty,
    network_hashrate: networkHashrate,
    height,
    block_reward: blockRewards[coin] || 0,
    block_time: blockTime,
    timestamp: Date.now(),
    source: 'nownodes.io'
  };
}
