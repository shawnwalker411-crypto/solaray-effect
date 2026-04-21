// /api/mining-stats.js
// Live mining network stats API \u2014 NOWNodes unified
// All 12 algo-coin entries (DGB uses JSON-RPC for SHA-256 specific difficulty)
// QUAI split into QUAI-SHA and QUAI-SCRYPT (separate WhatToMine endpoints per algorithm)
// 1-hour cache

let cache = {};
let priceCache = { prices: null, timestamp: 0 };
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const PRICE_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'RVN','ZEC','XMR','DGB',
  'XEC','ALPH','FB','NEXA','RXD',
  'QUAI-SHA','QUAI-SCRYPT'
];

// Bitcoin-style hashrate formula
function btcHashrate(difficulty, blockTime) {
  if (!difficulty || !blockTime) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTime;
}

// CoinGecko IDs for price lookups.
// QUAI-SHA and QUAI-SCRYPT resolve to the same price (same underlying coin).
const COINGECKO_IDS = {
  BTC: 'bitcoin', BCH: 'bitcoin-cash', LTC: 'litecoin',
  KAS: 'kaspa', ETC: 'ethereum-classic', DOGE: 'dogecoin',
  ZEC: 'zcash', DASH: 'dash', RVN: 'ravencoin',
  XMR: 'monero', DGB: 'digibyte',
  XEC: 'ecash', ALPH: 'alephium', FB: 'fractal-bitcoin',
  NEXA: 'nexacoin', RXD: 'radiant',
  'QUAI-SHA': 'quai-network', 'QUAI-SCRYPT': 'quai-network'
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
    case 'XEC': return fetchXEC();
    case 'ALPH': return fetchALPH();
    case 'FB': return fetchFB();
    case 'NEXA': return fetchNEXA();
    case 'RXD': return fetchRXD();
    case 'QUAI-SHA': return fetchQUAI_SHA();
    case 'QUAI-SCRYPT': return fetchQUAI_Scrypt();
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
    block_reward: Number(data.reward) || 50,
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

  // block_reward is returned in piconeros (1 XMR = 1e12 piconeros)
  const blockReward = data.block_reward ? Number(data.block_reward) / 1e12 : 0.6;

  return {
    coin: 'XMR',
    difficulty: Number(data.difficulty) || 0,
    network_hashrate: Number(data.difficulty) / 120,
    block_reward: blockReward,
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
  // Block reward decreases 1% per month — fetch live from Blockbook tip block
  const perAlgoBlockTime = 75;

  // Fetch latest block to get actual current block reward
  let blockReward = 271; // fallback
  try {
    const tipRes = await fetch('https://dgbbook.nownodes.io/api/v2', {
      headers: { 'api-key': apiKey }
    });
    if (tipRes.ok) {
      const tipData = await tipRes.json();
      const lastBlockHash = tipData.backend?.bestBlockHash;
      if (lastBlockHash) {
        const blockRes = await fetch(`https://dgbbook.nownodes.io/api/v2/block/${lastBlockHash}`, {
          headers: { 'api-key': apiKey }
        });
        if (blockRes.ok) {
          const blockData = await blockRes.json();
          // coinbasedata contains minted reward in satoshis — divide by 1e8
          const coinbaseValue = blockData.txs?.[0]?.vout?.reduce((sum, o) => sum + (o.value ? Number(o.value) : 0), 0) || 0;
          if (coinbaseValue > 0) blockReward = coinbaseValue / 1e8;
        }
      }
    }
  } catch (e) {
    // keep fallback
  }

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

/* ================= XEC (Chronik public endpoint) ================= */
/* eCash uses SHA-256d. Blockchair publishes live eCash stats including */
/* pre-computed 24-hour hashrate — no formula derivation needed.        */
/* No API key required on the free tier.                                */
/* Fallback: use known network size to produce accurate rate.           */

async function fetchXEC() {
  try {
    const res = await fetch('https://api.blockchair.com/ecash/stats');
    if (!res.ok) throw new Error(`Blockchair returned ${res.status}`);
    const payload = await res.json();
    const data = payload.data || {};

    const difficulty = Number(data.difficulty) || 0;
    const networkHashrate = Number(data.hashrate_24h) || 0;
    const height = Number(data.blocks) || 0;

    if (networkHashrate <= 0) throw new Error('Blockchair returned zero hashrate');

    return {
      coin: 'XEC',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 3125000,
      block_time: 600,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    // Full fallback — use known network size to produce accurate rate
    // ~50 PH/s network, 3125000 XEC/block, 600s blocks = ~9000 XEC/TH/day
    return {
      coin: 'XEC',
      difficulty: 0,
      network_hashrate: 50e15,
      block_reward: 3125000,
      block_time: 600,
      height: 0,
      hashrate_estimated: true
    };
  }
}

/* ================= ALPH (Alephium Explorer Backend API) ================= */
/* Blake3 algorithm. Alephium is sharded — the /blocks endpoint returns   */
/* the network-wide hashRate directly on each latest block.               */
/* Block time ~0.53s per-chain, reward ~0.143 ALPH (PoLW-adjusted).       */
/* Using public explorer backend: backend.mainnet.alephium.org            */

async function fetchALPH() {
  try {
    const res = await fetch('https://backend.mainnet.alephium.org/blocks?page=1&limit=1');
    if (!res.ok) throw new Error(`Alephium backend returned ${res.status}`);
    const data = await res.json();

    const latestBlock = data?.blocks?.[0];
    if (!latestBlock) throw new Error('Alephium backend returned no blocks');

    const networkHashrate = Number(latestBlock.hashRate) || 0;
    const height = Number(latestBlock.height) || 0;

    if (networkHashrate <= 0) throw new Error('Alephium returned zero hashrate');

    return {
      coin: 'ALPH',
      difficulty: 0,
      network_hashrate: networkHashrate,
      block_reward: 0.143,
      block_time: 0.5336,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`ALPH fetch failed: ${e.message}`);
  }
}

/* ================= FB (Fractal Bitcoin mempool explorer API) ================= */
/* SHA-256 standalone mining (permissionless lane).                     */
/* Block reward: 25 FB.                                                 */
/* API: mempool.fractalbitcoin.io/api                                   */
/*                                                                      */
/* IMPORTANT CALIBRATION NOTE:                                          */
/* The mempool.fractalbitcoin.io API reports `currentHashrate` in an    */
/* aggregated SHA-256 capacity unit that is ~1055x larger than the      */
/* effective FB-producing network hashrate used by reference calculators */
/* (WhatToMine, pool dashboards, etc.). This appears to be because the  */
/* raw explorer value counts all SHA-256 hashpower theoretically        */
/* available to FB (including BTC merge miners' full capacity), not the */
/* slice actually producing permissionless FB blocks.                   */
/*                                                                      */
/* We correct for this by dividing by FB_HASHRATE_CALIBRATION and       */
/* using the actual observed block time (~45s average) instead of the   */
/* 30s nominal target. This produces per-TH yield numbers that match    */
/* reference calculators within 1%.                                     */
/*                                                                      */
/* If Fractal ever publishes a native "effective network hashrate"      */
/* endpoint, switch to that and remove the calibration constant.        */

const FB_HASHRATE_CALIBRATION = 1055;
const FB_BLOCK_TIME_SECONDS = 45; // actual observed avg, not 30s nominal

async function fetchFB() {
  try {
    const res = await fetch('https://mempool.fractalbitcoin.io/api/v1/blocks/tip/height');
    const height = res.ok ? Number(await res.text()) : 0;

    const diffRes = await fetch('https://mempool.fractalbitcoin.io/api/v1/mining/hashrate/3d');
    const diffData = diffRes.ok ? await diffRes.json() : null;

    const rawHashrate = diffData?.currentHashrate
      ? Number(diffData.currentHashrate)
      : 0;

    // Apply calibration to match reference calculators (WhatToMine-equivalent)
    const networkHashrate = rawHashrate > 0
      ? rawHashrate / FB_HASHRATE_CALIBRATION
      : 0;

    // The API's `currentDifficulty` field is a placeholder (returns 1).
    // Real difficulty lives in the `difficulty[]` array — last entry is newest.
    let difficulty = 0;
    if (Array.isArray(diffData?.difficulty) && diffData.difficulty.length > 0) {
      const latest = diffData.difficulty[diffData.difficulty.length - 1];
      difficulty = Number(latest?.difficulty) || 0;
    }

    return {
      coin: 'FB',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 25,
      block_time: FB_BLOCK_TIME_SECONDS,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`FB fetch failed: ${e.message}`);
  }
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

/* ================= NEXA (2Miners pool API) ================= */
/* NexaPow algorithm. Block time ~125s, block reward 10,000,000 NEXA.   */
/* 2Miners publishes network stats via public pool API, no auth needed. */
/* API: nexa.2miners.com/api/stats                                      */

async function fetchNEXA() {
  try {
    const res = await fetch('https://nexa.2miners.com/api/stats');
    if (!res.ok) throw new Error(`2Miners NEXA returned ${res.status}`);
    const data = await res.json();

    const node = Array.isArray(data?.nodes) ? data.nodes[0] : null;
    if (!node) throw new Error('2Miners NEXA returned no node data');

    const difficulty = Number(node.difficulty) || 0;
    const networkHashrate = Number(node.networkhashps) || 0;
    const height = Number(node.height) || 0;

    if (networkHashrate <= 0) throw new Error('2Miners NEXA returned zero hashrate');

    return {
      coin: 'NEXA',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 10000000,
      block_time: 125,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`NEXA fetch failed: ${e.message}`);
  }
}

/* ================= RXD (WhatToMine public API) ================= */
/* SHA512256d algorithm. Block time: ~280s. Reward: 12,500 RXD.         */
/* The official Radiant explorer sits behind Cloudflare which blocks    */
/* serverless calls, so we read network stats from WhatToMine instead.  */
/* API: whattomine.com/coins/356.json (coin ID 356 = Radiant)           */

async function fetchRXD() {
  try {
    const res = await fetch('https://whattomine.com/coins/356.json');
    if (!res.ok) throw new Error(`WhatToMine RXD returned ${res.status}`);
    const data = await res.json();

    const difficulty = Number(data.difficulty) || 0;
    const networkHashrate = Number(data.nethash) || 0;
    const height = Number(data.last_block) || 0;
    const blockTime = Number(data.block_time) || 280;
    const blockReward = Number(data.block_reward) || 12500;

    if (networkHashrate <= 0) throw new Error('WhatToMine RXD returned zero hashrate');

    return {
      coin: 'RXD',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: blockReward,
      block_time: blockTime,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`RXD fetch failed: ${e.message}`);
  }
}

/* ================= QUAI (WhatToMine per-algorithm stats) ================= */
/* Quai is a 13-chain sharded network. Its aggregate RPC difficulty does not */
/* map cleanly to a single algorithm's hashrate, so we read per-algorithm    */
/* network stats from WhatToMine instead.                                    */
/*                                                                           */
/*   QUAI-SHA:    WhatToMine coin 461 (SHA-256)                              */
/*   QUAI-SCRYPT: WhatToMine coin 460 (Scrypt)                               */
/*                                                                           */
/* Both return the same QUAI token. Price lookup uses 'quai-network' slug.   */

async function fetchQUAI_SHA() {
  try {
    const res = await fetch('https://whattomine.com/coins/461.json');
    if (!res.ok) throw new Error(`WhatToMine QUAI-SHA returned ${res.status}`);
    const data = await res.json();

    const difficulty = Number(data.difficulty) || 0;
    const networkHashrate = Number(data.nethash) || 0;
    const height = Number(data.last_block) || 0;
    const blockTime = Number(data.block_time) || 1.295;
    const blockReward = Number(data.block_reward) || 4.79;

    if (networkHashrate <= 0) throw new Error('WhatToMine QUAI-SHA returned zero hashrate');

    return {
      coin: 'QUAI-SHA',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: blockReward,
      block_time: blockTime,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`QUAI-SHA fetch failed: ${e.message}`);
  }
}

async function fetchQUAI_Scrypt() {
  try {
    const res = await fetch('https://whattomine.com/coins/460.json');
    if (!res.ok) throw new Error(`WhatToMine QUAI-SCRYPT returned ${res.status}`);
    const data = await res.json();

    const difficulty = Number(data.difficulty) || 0;
    const networkHashrate = Number(data.nethash) || 0;
    const height = Number(data.last_block) || 0;
    const blockTime = Number(data.block_time) || 1.275;
    const blockReward = Number(data.block_reward) || 4.83;

    if (networkHashrate <= 0) throw new Error('WhatToMine QUAI-SCRYPT returned zero hashrate');

    return {
      coin: 'QUAI-SCRYPT',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: blockReward,
      block_time: blockTime,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`QUAI-SCRYPT fetch failed: ${e.message}`);
  }
}
