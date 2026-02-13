// /api/mining-stats.js
// Safe live mining network stats API
// Zero divide-by-zero errors
// Zero fake hashrate
// 1-hour cache

let cache = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'RVN','ERG','ZEC','XMR','CKB','DGB'
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
    case 'BTC': return fetchBTC();
    case 'KAS': return fetchKAS();
    case 'ERG': return fetchERG();
    case 'ZEC': return fetchZEC();
    case 'XMR': return fetchXMR();
    case 'CKB': return fetchCKB();
    case 'DGB': return fetchDGB();
    case 'ETC': return fetchETC();
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'RVN':
      return fetchViaNowNodes(coin);
    default:
      throw new Error('Unsupported coin');
  }
}

/* ================= BTC ================= */

async function fetchBTC() {
  const [diffRes, heightRes] = await Promise.all([
    fetch('https://blockchain.info/q/getdifficulty'),
    fetch('https://blockchain.info/q/getblockcount')
  ]);

  const difficulty = Number(await diffRes.text());
  const height = Number(await heightRes.text());

  return {
    coin: 'BTC',
    difficulty,
    network_hashrate: btcHashrate(difficulty, 600),
    block_reward: 3.125,
    block_time: 600,
    height,
    hashrate_estimated: true
  };
}

/* ================= KAS ================= */

async function fetchKAS() {
  const res = await fetch('https://api.kaspa.org/info/network');
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

/* ================= ZEC ================= */

async function fetchZEC() {
  const res = await fetch('https://api.blockchair.com/zcash/stats');
  const json = await res.json();
  const data = json.data || {};

  const difficulty = Number(data.difficulty) || 0;
  const hashrate = Number(data.hashrate_24h) || 0;

  if (!hashrate) {
    throw new Error('ZEC hashrate missing from API');
  }

  return {
    coin: 'ZEC',
    difficulty,
    network_hashrate: hashrate,
    block_reward: 2.5,
    block_time: 75,
    height: data.best_block_height || 0,
    hashrate_estimated: false
  };
}

/* ================= XMR ================= */

async function fetchXMR() {
  const res = await fetch('https://api.blockchair.com/monero/stats');
  const json = await res.json();
  const data = json.data || {};

  return {
    coin: 'XMR',
    difficulty: Number(data.difficulty) || 0,
    network_hashrate: Number(data.hashrate_24h) || 0,
    block_reward: 0.6,
    block_time: 120,
    height: data.best_block_height || 0,
    hashrate_estimated: false
  };
}

/* ================= ERG ================= */

async function fetchERG() {
  const res = await fetch('https://api.ergoplatform.com/api/v1/networkState');
  const data = await res.json();

  return {
    coin: 'ERG',
    difficulty: data.difficulty || 0,
    network_hashrate: 0, // do NOT fake
    block_reward: 27,
    block_time: 120,
    height: data.height || 0,
    hashrate_estimated: false
  };
}

/* ================= ETC ================= */

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

  return {
    coin: 'ETC',
    difficulty,
    network_hashrate: 0,
    block_reward: 2.56,
    block_time: 14,
    height: parseInt(data.result?.number || '0', 16),
    hashrate_estimated: false
  };
}

/* ================= DGB ================= */

async function fetchDGB() {
  const [diffRes, hashRes, heightRes] = await Promise.all([
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getdifficulty'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=nethashps'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getblockcount')
  ]);

  return {
    coin: 'DGB',
    difficulty: Number(await diffRes.text()) || 0,
    network_hashrate: Number(await hashRes.text()) || 0,
    block_reward: 665,
    block_time: 15,
    height: Number(await heightRes.text()) || 0,
    hashrate_estimated: false
  };
}

/* ================= CKB ================= */

async function fetchCKB() {
  const res = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics', {
    headers: { 'Accept': 'application/vnd.api+json' }
  });

  const json = await res.json();
  const attrs = json.data?.attributes || {};

  return {
    coin: 'CKB',
    difficulty: Number(attrs.current_epoch_difficulty) || 0,
    network_hashrate: Number(attrs.hash_rate) || 0,
    block_reward: 500,
    block_time: (Number(attrs.average_block_time) || 8000) / 1000,
    height: Number(attrs.tip_block_number) || 0,
    hashrate_estimated: false
  };
}

/* ================= NOWNODES COINS ================= */

async function fetchViaNowNodes(coin) {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

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
    RVN: 1250
  };

  const blockTimes = {
    LTC: 150,
    DOGE: 60,
    BCH: 600,
    DASH: 150,
    RVN: 60
  };

  const res = await fetch(endpoints[coin], {
    headers: { 'api-key': apiKey }
  });

  const data = await res.json();
  const difficulty = Number(data.backend?.difficulty) || 0;

  let networkHashrate = 0;
  if (coin !== 'RVN') {
    networkHashrate = btcHashrate(difficulty, blockTimes[coin]);
  }

  return {
    coin,
    difficulty,
    network_hashrate: networkHashrate,
    block_reward: blockRewards[coin],
    block_time: blockTimes[coin],
    height: Number(data.backend?.blocks) || 0,
    hashrate_estimated: coin !== 'RVN'
  };
}
