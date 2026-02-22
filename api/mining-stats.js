// /api/mining-stats.js
// Live mining network stats API \u2014 NOWNodes unified
// All 11 coins via NOWNodes paid tier (DGB uses JSON-RPC for SHA-256 specific difficulty)
// 1-hour cache

let cache = {};
let priceCache = { prices: null, timestamp: 0 };
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const PRICE_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'RVN','ZEC','XMR','DGB'
];

// Bitcoin-style hashrate formula
function btcHashrate(difficulty, blockTime) {
  if (!difficulty || !blockTime) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTime;
}

// CoinGecko IDs for price lookups
const COINGECKO_IDS = {
  BTC: 'bitcoin', BCH: 'bitcoin-cash', LTC: 'litecoin',
  KAS: 'kaspa', ETC: 'ethereum-classic', DOGE: 'dogecoin',
  ZEC: 'zcash', DASH: 'dash', RVN: 'ravencoin',
  XMR: 'monero', DGB: 'digibyte'
};

async function fetchPricesFromCoinGecko() {
  // Return cached prices if still fresh
  if (priceCache.prices && Date.now() - priceCache.timestamp < PRICE_CACHE_DURATION) {
    return priceCache.prices;
  }
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('CoinGecko request failed');
    const data = await res.json();
    const prices = {};
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd) prices[symbol] = data[geckoId].usd;
    }
    if (Object.keys(prices).length > 0) {
      priceCache = { prices, timestamp: Date.now() };
    }
    return prices;
  } catch (e) {
    // Return last known prices if fetch fails
    return priceCache.prices || {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { coin, refresh } = req.query;
  const coinsToFetch = coin ? [coin.toUpperCase()] : COINS;

  const results = {};

  for (const c of coinsToFetch) {
    if (!COINS.includes(c)) {
      results[c] = { error: 'Unsupported coin' };
      continue;
    }

    if (!refresh && cache[c] && Date.now() - cache[c].timestamp < CACHE_DURATION) {
      results[c] = { ...cache[c], fromCache: true };
      continue;
    }

    try {
      const data = await fetchCoinData(c);
      cache[c] = { ...data, timestamp: Date.now() };
      results[c] = { ...data, fromCache: false };
    } catch (e) {
      results[c] = { error: e.message };
    }
  }

  // Fetch cached prices (runs alongside blockchain data)
  const prices = await fetchPricesFromCoinGecko();

  res.status(200).json({
    success: true,
    cache_hours: 1,
    prices: prices,
    data: coin ? results[coin.toUpperCase()] : results
  });
}

async function fetchCoinData(coin) {
  switch (coin) {
    case 'KAS': return fetchKAS();
    case 'XMR': return fetchXMR();
    case 'DGB': return fetchDGB();
    case 'BTC':
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'RVN':
    case 'ETC':
    case 'ZEC':
      return fetchViaNowNodes(coin);
    default:
      throw new Error('Unsupported coin');
  }
}

/* ================= KAS (NOWNodes Kaspa REST) ================= */

async function fetchKAS() {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const res = await fetch('https://kas.nownodes.io/info/network', {
    headers: { 'api-key': apiKey }
  });

  const data = await res.json();

  return {
    coin: 'KAS',
    difficulty: data.difficulty || 0,
    network_hashrate: data.hashrate || 0,
    block_reward: 50,
    block_time: 1,
    height: data.blockCount || 0,
    hashrate_estimated: false
  };
}

/* ================= XMR (NOWNodes Monero JSON-RPC) ================= */

async function fetchXMR() {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const res = await fetch('https://xmr.nownodes.io/json_rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '0',
      method: 'get_info'
    })
  });

  const json = await res.json();
  const data = json.result || {};

  return {
    coin: 'XMR',
    difficulty: Number(data.difficulty) || 0,
    network_hashrate: Number(data.difficulty) / 120,
    block_reward: 0.6,
    block_time: 120,
    height: Number(data.height) || 0,
    hashrate_estimated: true
  };
}

/* ================= DGB (NOWNodes DigiByte JSON-RPC) ================= */
/* Uses getmininginfo which returns per-algorithm fields:               */
/*   difficulties: { sha256d, scrypt, skein, qubit, odo }              */
/*   networkhashesps: { sha256d, scrypt, skein, qubit, odo }           */
/* This gives accurate SHA-256 specific hashrate instead of blended.   */

async function fetchDGB() {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const res = await fetch('https://dgb.nownodes.io', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'dgb-mining',
      method: 'getmininginfo',
      params: []
    })
  });

  const json = await res.json();
  const data = json.result || {};

  // SHA-256 specific values from the per-algorithm objects
  const sha256Difficulty = Number(data.difficulties?.sha256d) || 0;
  const networkHashrate = Number(data.networkhashesps?.sha256d) || 0;

  // DGB has 5 algos, each targets ~75 sec block time (15 sec overall / 5 algos)
  // Block reward decreases 1% per month — ~271 DGB per block as of early 2026
  const perAlgoBlockTime = 75;
  const blockReward = 271;

  return {
    coin: 'DGB',
    difficulty: sha256Difficulty,
    network_hashrate: networkHashrate,
    block_reward: blockReward,
    block_time: perAlgoBlockTime,
    height: Number(data.blocks) || 0,
    hashrate_estimated: false
  };
}

/* ================= NOWNODES BLOCKBOOK COINS (8 coins) ================= */

async function fetchViaNowNodes(coin) {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const endpoints = {
    BTC: 'https://btcbook.nownodes.io/api/v2',
    LTC: 'https://ltcbook.nownodes.io/api/v2',
    DOGE: 'https://dogebook.nownodes.io/api/v2',
    BCH: 'https://bchbook.nownodes.io/api/v2',
    DASH: 'https://dashbook.nownodes.io/api/v2',
    RVN: 'https://rvnbook.nownodes.io/api/v2',
    ETC: 'https://etcbook.nownodes.io/api/v2',
    ZEC: 'https://zecbook.nownodes.io/api/v2'
  };

  const blockRewards = {
    BTC: 3.125,
    LTC: 6.25,
    DOGE: 10000,
    BCH: 3.125,
    DASH: 0.44,
    RVN: 1250,
    ETC: 2.56,
    ZEC: 1.25
  };

  const blockTimes = {
    BTC: 600,
    LTC: 150,
    DOGE: 60,
    BCH: 600,
    DASH: 150,
    RVN: 60,
    ETC: 14,
    ZEC: 75
  };

  const res = await fetch(endpoints[coin], {
    headers: { 'api-key': apiKey }
  });

  const data = await res.json();
  const difficulty = Number(data.backend?.difficulty) || 0;

  // Estimate hashrate from difficulty for coins that support it
  // RVN and ETC use different difficulty schemes \u2014 skip estimation
  // ZEC uses Equihash which needs 2^13 factor instead of 2^32
  let networkHashrate = 0;
  let hashEstimated = false;
  if (coin === 'ZEC') {
    networkHashrate = (difficulty * Math.pow(2, 13)) / blockTimes[coin];
    hashEstimated = true;
  } else if (coin !== 'RVN' && coin !== 'ETC') {
    networkHashrate = btcHashrate(difficulty, blockTimes[coin]);
    hashEstimated = true;
  }

  return {
    coin,
    difficulty,
    network_hashrate: networkHashrate,
    block_reward: blockRewards[coin],
    block_time: blockTimes[coin],
    height: Number(data.backend?.blocks) || 0,
    hashrate_estimated: hashEstimated
  };
}
