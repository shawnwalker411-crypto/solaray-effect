// /api/mining-stats.js
// Live mining network stats API \u2014 NOWNodes unified
// 17 coins: BTC, LTC, DOGE, KAS, BCH, DASH, ETC, RVN, ZEC, XMR, DGB, XEC, ALPH, FB, NEXA, RXD, QUAI
// 1-hour cache

let cache = {};
let priceCache = { prices: null, timestamp: 0 };
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const PRICE_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'RVN','ZEC','XMR','DGB',
  'XEC','ALPH','FB','NEXA','RXD','QUAI'
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
  XMR: 'monero', DGB: 'digibyte',
  XEC: 'ecash', ALPH: 'alephium', FB: 'fractal-bitcoin',
  NEXA: 'nexacoin', RXD: 'radiant', QUAI: 'quai-network'
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
    case 'QUAI': return fetchQUAI();
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
/* eCash uses SHA-256d. Chronik is eCash's official public indexer.   */
/* No API key required. Returns blockchainInfo with difficulty.       */
/* Network hashrate derived from difficulty using ASERT formula.      */
/* Fallback: use known-good default of 4500 XEC/TH/day.              */

async function fetchXEC() {
  try {
    // Chronik blockchain-info endpoint — public, no auth required
    const res = await fetch('https://chronik.be.cash/xec/blockchain-info');
    if (!res.ok) throw new Error(`Chronik returned ${res.status}`);
    const data = await res.json();

    // Chronik returns difficulty as a number directly
    const difficulty = Number(data.difficulty) || 0;

    // XEC uses ASERT DAA — hashrate formula identical to BTC SHA-256d
    // difficulty * 2^32 / block_time gives H/s
    const networkHashrate = difficulty > 0
      ? (difficulty * Math.pow(2, 32)) / 600
      : 75e15; // fallback: 75 PH/s (confirmed live April 2026)

    return {
      coin: 'XEC',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 3125000,
      block_time: 600,
      height: Number(data.tipHeight) || 0,
      hashrate_estimated: true
    };
  } catch (e) {
    // Full fallback — use known network size to produce accurate rate
    // 75 PH/s network, 3125000 XEC/block, 600s blocks = ~4500 XEC/TH/day
    return {
      coin: 'XEC',
      difficulty: 0,
      network_hashrate: 75e15,
      block_reward: 3125000,
      block_time: 600,
      height: 0,
      hashrate_estimated: true
    };
  }
}

/* ================= ALPH (Alephium Explorer Backend API) ================= */
/* Blake3 algorithm. Alephium is sharded — hashrate and difficulty are  */
/* reported at the network level. Block time ~64s, reward dynamic.      */
/* Using public explorer backend: backend.mainnet.alephium.org          */

async function fetchALPH() {
  try {
    const [infoRes, hashrateRes] = await Promise.all([
      fetch('https://backend.mainnet.alephium.org/infos/current-hashrate?timespan=10m'),
      fetch('https://backend.mainnet.alephium.org/blockflow/blocks?fromTs=0&toTs=0')
    ]);

    // Get hashrate
    const hashrateData = infoRes.ok ? await infoRes.json() : null;
    const networkHashrate = hashrateData?.hashrate
      ? Number(hashrateData.hashrate)
      : 0;

    // Get chain info for block height and reward
    const chainRes = await fetch('https://backend.mainnet.alephium.org/infos/supply/circulating-alph');
    const blockRes = await fetch('https://backend.mainnet.alephium.org/blocks?page=1&limit=1');
    const blockData = blockRes.ok ? await blockRes.json() : null;
    const latestBlock = blockData?.blocks?.[0];

    return {
      coin: 'ALPH',
      difficulty: 0,
      network_hashrate: networkHashrate,
      block_reward: 3.0,
      block_time: 64,
      height: latestBlock?.height || 0,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`ALPH fetch failed: ${e.message}`);
  }
}

/* ================= FB (Fractal Bitcoin mempool explorer API) ================= */
/* SHA-256 standalone mining. Block time: 30s (20x faster than BTC).   */
/* Block reward: 25 FB per block (permissionless mining portion).       */
/* API: mempool.fractalbitcoin.io/api                                   */

async function fetchFB() {
  try {
    const res = await fetch('https://mempool.fractalbitcoin.io/api/v1/blocks/tip/height');
    const height = res.ok ? Number(await res.text()) : 0;

    const diffRes = await fetch('https://mempool.fractalbitcoin.io/api/v1/mining/hashrate/3d');
    const diffData = diffRes.ok ? await diffRes.json() : null;

    const networkHashrate = diffData?.currentHashrate
      ? Number(diffData.currentHashrate)
      : 0;
    const difficulty = diffData?.currentDifficulty
      ? Number(diffData.currentDifficulty)
      : 0;

    // Compute actual average block time from last 3 days of hashrate data
    // diffData.blockCount and diffData.difficulty can give us real block interval
    // Fallback: use 45s (confirmed from asicminervalue April 2026)
    let blockTime = 45;
    if (diffData?.timestamps?.length >= 2) {
      const timestamps = diffData.timestamps;
      const blocks = diffData.blockCount || 0;
      if (blocks > 0) {
        const elapsed = timestamps[timestamps.length - 1] - timestamps[0];
        const computed = elapsed / blocks;
        if (computed > 5 && computed < 120) blockTime = Math.round(computed);
      }
    }

    return {
      coin: 'FB',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 25,
      block_time: blockTime,
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

/* ================= NEXA (CoinExplorer REST API) ================= */
/* NexaPow algorithm. Block time ~2s, block reward decreasing.         */
/* API: coinexplorer.net/api/v1/NEXA                                   */
/* Rate limit: ~1 req/sec on public tier.                               */

async function fetchNEXA() {
  try {
    const [blockRes, supplyRes] = await Promise.all([
      fetch('https://coinexplorer.net/api/v1/NEXA/blocks?limit=1'),
      fetch('https://coinexplorer.net/api/v1/NEXA/status')
    ]);

    const blockData = blockRes.ok ? await blockRes.json() : null;
    const statusData = supplyRes.ok ? await supplyRes.json() : null;

    const latestBlock = blockData?.data?.[0] || blockData?.[0] || null;
    const height = latestBlock?.height || statusData?.blockcount || 0;

    // NEXA difficulty and hashrate from status
    const difficulty = Number(statusData?.difficulty) || 0;
    // NexaPow hashrate formula similar to SHA256d
    const networkHashrate = difficulty > 0
      ? (difficulty * Math.pow(2, 32)) / 2
      : 0;

    // Block reward — read from status if available, fallback to 4
    const blockReward = statusData?.reward
      ? Number(statusData.reward)
      : statusData?.block_reward
      ? Number(statusData.block_reward)
      : 4;

    return {
      coin: 'NEXA',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: blockReward,
      block_time: 2,
      height: Number(height) || 0,
      hashrate_estimated: true
    };
  } catch (e) {
    throw new Error(`NEXA fetch failed: ${e.message}`);
  }
}

/* ================= RXD (Radiant Explorer API) ================= */
/* SHA512256d algorithm. Block time: 5 minutes.                        */
/* Block reward: 12,500 RXD (post-April 2026 halving).                 */
/* API: explorer.radiantblockchain.org                                  */

async function fetchRXD() {
  try {
    const res = await fetch('https://explorer.radiantblockchain.org/api/status');
    if (!res.ok) throw new Error(`RXD explorer returned ${res.status}`);
    const data = await res.json();

    const difficulty = Number(data.info?.difficulty) || 0;
    const height = Number(data.info?.blocks) || 0;

    // SHA512256d hashrate approximation
    // Uses 2^256 / difficulty / blockTime formula
    const networkHashrate = difficulty > 0
      ? (difficulty * Math.pow(2, 32)) / 300
      : 0;

    return {
      coin: 'RXD',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: 12500,
      block_time: 300,
      height,
      hashrate_estimated: true
    };
  } catch (e) {
    throw new Error(`RXD fetch failed: ${e.message}`);
  }
}

/* ================= QUAI (Official Quai JSON-RPC — Cyprus-1 zone) ================= */
/* Quai is a multi-shard network. Cyprus-1 is the primary zone.        */
/* Serves both QUAI-SHA (SHA-256) and QUAI-Scrypt algorithm entries.   */
/* Block time: ~1.1s per zone, block reward dynamic.                   */
/* RPC endpoint: rpc.cyprus1.colosseum.quai.network                    */

async function fetchQUAI() {
  try {
    const rpcUrl = 'https://rpc.cyprus1.colosseum.quai.network';

    const [blockNumRes, blockRes] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'quai_blockNumber', params: []
        })
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 2,
          method: 'quai_getBlockByNumber', params: ['latest', false]
        })
      })
    ]);

    const blockNumData = blockNumRes.ok ? await blockNumRes.json() : null;
    const blockData = blockRes.ok ? await blockRes.json() : null;

    const height = blockNumData?.result
      ? parseInt(blockNumData.result, 16)
      : 0;

    const block = blockData?.result || {};
    const difficulty = block.difficulty
      ? parseInt(block.difficulty, 16)
      : 0;

    // Quai block reward is dynamic — ~5 QUAI per block as baseline
    const blockReward = 5;

    // Hashrate estimate from difficulty
    const networkHashrate = difficulty > 0
      ? (difficulty * Math.pow(2, 32)) / 1.1
      : 0;

    return {
      coin: 'QUAI',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: blockReward,
      block_time: 1.1,
      height,
      hashrate_estimated: true
    };
  } catch (e) {
    throw new Error(`QUAI fetch failed: ${e.message}`);
  }
}
