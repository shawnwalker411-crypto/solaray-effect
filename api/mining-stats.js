// /api/mining-stats.js (Vercel Serverless Function)
// Live mining network stats with safe hashrate handling + 2h cache

let cache = {};

const DEFAULT_CACHE_HOURS = 2; // was 48h; too stale for “live” stats

const SUPPORTED_COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC','RVN','ERG','ZEC','XMR','CKB','DGB'
];

// Coins where difficulty->hashrate using (diff * 2^32 / block_time) is typically acceptable
// NOTE: If any of these still look off, set canEstimateHashrate=false for that coin.
const COIN_META = {
  BTC:  { block_time: 600,  block_reward: 3.125, canEstimateHashrate: true  },
  BCH:  { block_time: 600,  block_reward: 3.125, canEstimateHashrate: true  },

  // These *may* be OK with the formula depending on endpoint difficulty semantics.
  // If you keep seeing wrong hashrates, flip canEstimateHashrate to false and just omit hashrate.
  LTC:  { block_time: 150,  block_reward: 6.25,  canEstimateHashrate: true  },
  DOGE: { block_time: 60,   block_reward: 10000, canEstimateHashrate: true  },
  DASH: { block_time: 150,  block_reward: 0.44,  canEstimateHashrate: true  },

  // RVN: do NOT estimate hashrate from difficulty here (KawPoW difficulty semantics differ).
  // Also block reward is 1250 post-halving. :contentReference[oaicite:2]{index=2}
  RVN:  { block_time: 60,   block_reward: 1250,  canEstimateHashrate: false },

  // These you previously approximated; keep them but mark estimated.
  ERG:  { block_time: 120,  block_reward: 27,    canEstimateHashrate: false },
  ETC:  { block_time: 14,   block_reward: 2.56,  canEstimateHashrate: false },

  // Others handled by their own fetchers
  KAS:  { block_time: 1,    block_reward: 50,    canEstimateHashrate: false },
  ZEC:  { block_time: 75,   block_reward: 2.5,   canEstimateHashrate: false },
  XMR:  { block_time: 120,  block_reward: 0.6,   canEstimateHashrate: false },
  CKB:  { block_time: 0,    block_reward: 500,   canEstimateHashrate: false },
  DGB:  { block_time: 15,   block_reward: 665,   canEstimateHashrate: false },
};

function ms(hours) {
  return hours * 60 * 60 * 1000;
}

function estimateHashrateFromDifficulty(difficulty, blockTimeSec) {
  // Bitcoin-style definition: hashrate = difficulty * 2^32 / block_time :contentReference[oaicite:3]{index=3}
  if (!difficulty || !blockTimeSec) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTimeSec;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { coin, refresh, cacheHours } = req.query;

  const requestedCoins = coin
    ? [String(coin).toUpperCase()]
    : SUPPORTED_COINS.slice();

  const cacheDuration = ms(
    Number.isFinite(Number(cacheHours)) ? Number(cacheHours) : DEFAULT_CACHE_HOURS
  );

  const results = {};

  for (const c of requestedCoins) {
    if (!SUPPORTED_COINS.includes(c)) {
      results[c] = { error: `Unsupported coin: ${c}` };
      continue;
    }

    // Serve cache unless refresh=true
    if (!refresh && cache[c] && (Date.now() - cache[c].timestamp < cacheDuration)) {
      results[c] = { ...cache[c], fromCache: true };
      continue;
    }

    try {
      const data = await fetchCoinData(c);

      // Normalize: add meta + safe flags
      const meta = COIN_META[c] || {};
      const normalized = {
        ...data,
        block_time: data.block_time ?? meta.block_time ?? null,
        block_reward: data.block_reward ?? meta.block_reward ?? null,
      };

      cache[c] = { ...normalized, timestamp: Date.now() };
      results[c] = { ...normalized, fromCache: false };
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`Error fetching ${c}:`, msg);

      if (cache[c]) {
        results[c] = { ...cache[c], fromCache: true, stale: true, error: msg };
      } else {
        results[c] = { coin: c, error: msg };
      }
    }
  }

  return res.status(200).json({
    success: true,
    cache_duration_hours: cacheDuration / (60 * 60 * 1000),
    data: coin ? results[String(coin).toUpperCase()] : results
  });
}

async function fetchCoinData(coin) {
  const NOWNODES_KEY = process.env.NOWNODES_API_KEY;

  switch (coin) {
    case 'BTC': return await fetchBTC();
    case 'KAS': return await fetchKAS();
    case 'ERG': return await fetchERG();
    case 'ZEC': return await fetchZEC();
    case 'XMR': return await fetchXMR();
    case 'CKB': return await fetchCKB();
    case 'DGB': return await fetchDGB();
    case 'ETC': return await fetchETC();

    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'RVN':
      return await fetchViaNowNodesSafe(coin, NOWNODES_KEY);

    default:
      throw new Error(`Unsupported coin: ${coin}`);
  }
}

// BTC via blockchain.info
async function fetchBTC() {
  const [diffRes, heightRes] = await Promise.all([
    fetch('https://blockchain.info/q/getdifficulty'),
    fetch('https://blockchain.info/q/getblockcount')
  ]);

  const difficulty = parseFloat(await diffRes.text());
  const height = parseInt(await heightRes.text(), 10);

  const blockTime = COIN_META.BTC.block_time;
  const networkHashrate = estimateHashrateFromDifficulty(difficulty, blockTime);

  return {
    coin: 'BTC',
    difficulty,
    network_hashrate: networkHashrate,
    hashrate_estimated: true,
    height,
    block_reward: COIN_META.BTC.block_reward,
    block_time: blockTime,
    source: 'blockchain.info',
    timestamp: Date.now()
  };
}

// KAS via Kaspa API
async function fetchKAS() {
  const res = await fetch('https://api.kaspa.org/info/network');
  if (!res.ok) throw new Error(`KAS fetch failed: HTTP ${res.status}`);
  const data = await res.json();

  return {
    coin: 'KAS',
    difficulty: data.difficulty || 0,
    network_hashrate: data.hashrate || 0,
    hashrate_estimated: false,
    height: data.blockCount || 0,
    block_reward: COIN_META.KAS.block_reward,
    block_time: COIN_META.KAS.block_time,
    source: 'api.kaspa.org',
    timestamp: Date.now()
  };
}

// ERG via Ergo Platform API (keep, but mark estimated hashrate)
async function fetchERG() {
  const res = await fetch('https://api.ergoplatform.com/api/v1/networkState');
  if (!res.ok) throw new Error(`ERG fetch failed: HTTP ${res.status}`);
  const data = await res.json();

  const difficulty = data.difficulty || 0;

  return {
    coin: 'ERG',
    difficulty,
    network_hashrate: 0, // do not guess here
    hashrate_estimated: false,
    note: 'ERG network hashrate not provided by this endpoint; leaving as 0 to avoid wrong estimates.',
    height: data.height || 0,
    block_reward: COIN_META.ERG.block_reward,
    block_time: COIN_META.ERG.block_time,
    source: 'ergoplatform.com',
    timestamp: Date.now()
  };
}

// ZEC via Blockchair
async function fetchZEC() {
  const res = await fetch('https://api.blockchair.com/zcash/stats');
  if (!res.ok) throw new Error(`ZEC fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  const data = json.data || {};

  return {
    coin: 'ZEC',
    difficulty: data.difficulty || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_estimated: false,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: COIN_META.ZEC.block_reward,
    block_time: COIN_META.ZEC.block_time,
    source: 'blockchair.com',
    timestamp: Date.now()
  };
}

// XMR via Blockchair (use their hashrate_24h directly)
async function fetchXMR() {
  const res = await fetch('https://api.blockchair.com/monero/stats');
  if (!res.ok) throw new Error(`XMR fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  const data = json.data || {};

  return {
    coin: 'XMR',
    difficulty: parseFloat(data.difficulty) || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_estimated: false,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: COIN_META.XMR.block_reward,
    block_time: COIN_META.XMR.block_time,
    source: 'blockchair.com',
    timestamp: Date.now()
  };
}

// CKB via Nervos Explorer API
async function fetchCKB() {
  const res = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics', {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    }
  });
  if (!res.ok) throw new Error(`CKB fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  const attrs = json.data?.attributes || {};

  const hashRate = parseFloat(attrs.hash_rate) || 0;
  const difficulty = parseFloat(attrs.current_epoch_difficulty) || 0;
  const height = parseInt(attrs.tip_block_number, 10) || 0;
  const avgBlockTimeMs = parseFloat(attrs.average_block_time) || 8000;

  return {
    coin: 'CKB',
    difficulty,
    network_hashrate: hashRate,
    hashrate_estimated: false,
    height,
    block_reward: COIN_META.CKB.block_reward,
    block_time: avgBlockTimeMs / 1000,
    source: 'explorer.nervos.org',
    timestamp: Date.now()
  };
}

// DGB via chainz.cryptoid.info
async function fetchDGB() {
  const [diffRes, hashRes, heightRes] = await Promise.all([
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getdifficulty'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=nethashps'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getblockcount')
  ]);

  const difficulty = parseFloat(await diffRes.text()) || 0;
  const networkHashrate = parseFloat(await hashRes.text()) || 0;
  const height = parseInt(await heightRes.text(), 10) || 0;

  return {
    coin: 'DGB',
    difficulty,
    network_hashrate: networkHashrate,
    hashrate_estimated: false,
    height,
    block_reward: COIN_META.DGB.block_reward,
    block_time: COIN_META.DGB.block_time,
    source: 'chainz.cryptoid.info',
    timestamp: Date.now()
  };
}

// ETC via public RPC (do not guess hashrate)
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
  if (!res.ok) throw new Error(`ETC fetch failed: HTTP ${res.status}`);

  const data = await res.json();
  const difficulty = parseInt(data.result?.difficulty || '0', 16);
  const height = parseInt(data.result?.number || '0', 16);

  return {
    coin: 'ETC',
    difficulty,
    network_hashrate: 0,
    hashrate_estimated: false,
    note: 'ETC network hashrate not derived here to avoid wrong values; supply a dedicated ETC stats source if needed.',
    height,
    block_reward: COIN_META.ETC.block_reward,
    block_time: COIN_META.ETC.block_time,
    source: 'etc.etcdesktop.com',
    timestamp: Date.now()
  };
}

// NowNodes Blockbook backend info with safe hashrate estimation
async function fetchViaNowNodesSafe(coin, apiKey) {
  if (!apiKey) throw new Error('NOWNodes API key not configured');

  const endpoints = {
    LTC:  'https://ltcbook.nownodes.io/api/v2',
    DOGE: 'https://dogebook.nownodes.io/api/v2',
    BCH:  'https://bchbook.nownodes.io/api/v2',
    DASH: 'https://dashbook.nownodes.io/api/v2',
    RVN:  'https://rvnbook.nownodes.io/api/v2'
  };

  const baseUrl = endpoints[coin];
  if (!baseUrl) throw new Error(`No endpoint for ${coin}`);

  const res = await fetch(baseUrl, { headers: { 'api-key': apiKey } });
  if (!res.ok) throw new Error(`${coin} NowNodes fetch failed: HTTP ${res.status}`);

  const data = await res.json();

  const difficulty = parseFloat(data.backend?.difficulty || data.difficulty || 0);
  const height = parseInt(data.backend?.blocks || data.blockbook?.bestHeight || 0, 10);

  const meta = COIN_META[coin] || {};
  const blockTime = meta.block_time || 60;

  let networkHashrate = 0;
  let hashrateEstimated = false;
  let note = undefined;

  if (meta.canEstimateHashrate) {
    networkHashrate = estimateHashrateFromDifficulty(difficulty, blockTime);
    hashrateEstimated = true;
    note = 'Hashrate estimated from difficulty using difficulty*2^32/block_time.';
  } else {
    networkHashrate = 0;
    hashrateEstimated = false;
    note = 'Hashrate not estimated for this coin from this endpoint to avoid incorrect values.';
  }

  return {
    coin,
    difficulty,
    network_hashrate: networkHashrate,
    hashrate_estimated: hashrateEstimated,
    note,
    height,
    block_reward: meta.block_reward ?? 0,
    block_time: blockTime,
    source: 'nownodes.io',
    timestamp: Date.now()
  };
}
