// /api/mining-stats.js
// Live mining network stats API — NOWNodes unified
// All 11 coins via NOWNodes paid tier
// 1-hour cache

let cache = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'RVN','ZEC','XMR','DGB'
];

// Bitcoin-style hashrate formula
function btcHashrate(difficulty, blockTime) {
  if (!difficulty || !blockTime) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTime;
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

  res.status(200).json({
    success: true,
    cache_hours: 1,
    data: coin ? results[coin.toUpperCase()] : results
  });
}

async function fetchCoinData(coin) {
  switch (coin) {
    case 'KAS': return fetchKAS();
    case 'XMR': return fetchXMR();
    case 'BTC':
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'RVN':
    case 'ETC':
    case 'ZEC':
    case 'DGB':
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

/* ================= NOWNODES BLOCKBOOK COINS (9 coins) ================= */

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
    ZEC: 'https://zecbook.nownodes.io/api/v2',
    DGB: 'https://dgbbook.nownodes.io/api/v2'
  };

  const blockRewards = {
    BTC: 3.125,
    LTC: 6.25,
    DOGE: 10000,
    BCH: 3.125,
    DASH: 0.44,
    RVN: 1250,
    ETC: 2.56,
    ZEC: 2.5,
    DGB: 665
  };

  const blockTimes = {
    BTC: 600,
    LTC: 150,
    DOGE: 60,
    BCH: 600,
    DASH: 150,
    RVN: 60,
    ETC: 14,
    ZEC: 75,
    DGB: 15
  };

  const res = await fetch(endpoints[coin], {
    headers: { 'api-key': apiKey }
  });

  const data = await res.json();
  const difficulty = Number(data.backend?.difficulty) || 0;

  // Estimate hashrate from difficulty for coins that support it
  // RVN and ETC use different difficulty schemes — skip estimation
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
