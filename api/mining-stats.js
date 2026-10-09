// /api/mining-stats.js
// Live mining network stats API \u2014 NOWNodes unified
// All 15 algo-coin entries (DGB uses JSON-RPC for SHA-256 specific difficulty)
// QUAI split into QUAI-SHA and QUAI-SCRYPT (separate WhatToMine endpoints per algorithm)
// Caches: network stats 5 minutes (ZEC 2), prices 10 minutes

let cache = {};
let priceCache = { prices: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (default) — was 1 hour, far too stale for a profitability calc
// Per-coin cache overrides. Mining network stats move fast; ZEC gets the shortest window.
const CACHE_DURATIONS = { ZEC: 2 * 60 * 1000 }; // ZEC: 2 minutes
function getCacheDuration(coin) { return CACHE_DURATIONS[coin] || CACHE_DURATION; }
// Server prices are the backup for visitors whose own CoinGecko call fails.
// 10 minutes keeps that backup fresh while calling CoinGecko at most ~6 times
// an hour per server instance.
const PRICE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes (was 2 hours)

const COINS = [
  'BTC','LTC','DOGE','KAS','BCH','DASH','ETC',
  'ZEC','DGB',
  'XEC','ALPH','FB','BSV',
  'QUAI-SHA','QUAI-SCRYPT'
];

// Bitcoin-style hashrate formula
function btcHashrate(difficulty, blockTime) {
  if (!difficulty || !blockTime) return 0;
  return (difficulty * Math.pow(2, 32)) / blockTime;
}

/* ================= SHARED PAYOUT FORMULA ================= */
/* Expected coins per day for ONE calculator unit of hashrate:            */
/*   coins/day = unitHashes * 86400 * blockReward / (difficulty * K)        */
/* This is the same formula pools use to pay PPS and that WhatToMine,      */
/* CoinWarz, 2CryptoCalc, Hashrate.no and AntPool use. It needs only       */
/* difficulty and reward (both read from the chain), so it does not depend */
/* on an estimated network hashrate or an assumed block time.              */
/* K = hashes per unit of difficulty: 2^32 for SHA-256, Scrypt and X11,    */
/* 2^13 for Equihash (ZEC), 1 for Etchash (ETC).                           */
/* Units match the calculator: SHA-256 per TH/s, Scrypt per MH/s,          */
/* X11 per GH/s, Equihash per kSol/s, Etchash per MH/s.                    */
/* QUAI uses K = 1 (its difficulty is already in hashes), as WhatToMine,    */
/* ASIC Miner Value and 2CryptoCalc do. KAS and ALPH are not on this       */
/* formula (DAG / sharded chains); the calculator keeps their own method,  */
/* which matches other calculators.                                        */
const YIELD_UNIT = {
  BTC: 1e12, BCH: 1e12, BSV: 1e12, XEC: 1e12, DGB: 1e12, FB: 1e12,
  LTC: 1e6, DOGE: 1e6, DASH: 1e9, ZEC: 1e3, ETC: 1e6,
  'QUAI-SHA': 1e12, 'QUAI-SCRYPT': 1e6
};
const YIELD_K = { ZEC: 8192, ETC: 1, 'QUAI-SHA': 1, 'QUAI-SCRYPT': 1 };

export function perUnitDay(coin, difficulty, blockReward) {
  const unit = YIELD_UNIT[coin];
  if (!unit) return null;
  const d = Number(difficulty), r = Number(blockReward);
  if (!(d > 0) || !(r > 0)) return null;
  const k = YIELD_K[coin] || 4294967296;
  return unit * 86400 * r / (d * k);
}

/* WhatToMine 24-hour average difficulty. Used for the coins whose          */
/* difficulty swings 10-40% within a day (DOGE, DGB, ZEC, DASH, ETC, FB;     */
/* QUAI reads it in its own fetcher); a single reading would make the       */
/* calculator and Hot Pick jump around. Returns 0 on any failure, and the   */
/* caller then uses the chain's current difficulty.                         */
async function wtmDifficulty24(id) {
  try {
    const res = await fetch(`https://whattomine.com/coins/${id}.json`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return 0;
    const d = await res.json();
    return Number(d.difficulty24) || 0;
  } catch (e) { return 0; }
}

// CoinGecko IDs for price lookups.
// QUAI-SHA and QUAI-SCRYPT resolve to the same price (same underlying coin).
const COINGECKO_IDS = {
  BTC: 'bitcoin', BCH: 'bitcoin-cash', LTC: 'litecoin',
  KAS: 'kaspa', ETC: 'ethereum-classic', DOGE: 'dogecoin',
  ZEC: 'zcash', DASH: 'dash',
  DGB: 'digibyte',
  XEC: 'ecash', ALPH: 'alephium', FB: 'fractal-bitcoin',
  BSV: 'bitcoin-cash-sv',
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
    // Start from the last known prices so a coin CoinGecko leaves out of this
    // answer keeps its previous price instead of disappearing.
    const prices = { ...(priceCache.prices || {}) };
    let fresh = 0;
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      if (data[geckoId]?.usd > 0) { prices[symbol] = data[geckoId].usd; fresh++; }
    }
    if (fresh > 0) {
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

  /* Fetch all coins in parallel instead of sequentially.
     Previously: for-await loop summed every external API call's latency,
     which with 16 coins and slow explorers (WhatToMine, mempool.fractalbitcoin.io)
     was producing response times in the 10-20 second range.
     Parallel fetch caps total latency at the single slowest call.
     Fetch prices in parallel too so the whole handler runs in one wave. */

  const coinPromises = coinsToFetch.map(async (c) => {
    if (!COINS.includes(c)) {
      results[c] = { error: 'Unsupported coin' };
      return;
    }

    if (!refresh && cache[c] && Date.now() - cache[c].timestamp < getCacheDuration(c)) {
      results[c] = { ...cache[c], fromCache: true };
      return;
    }

    try {
      const data = await fetchCoinData(c);
      const y = perUnitDay(c, data.yield_difficulty || data.difficulty, data.block_reward);
      if (y) data.per_unit_day = y;
      cache[c] = { ...data, timestamp: Date.now() };
      results[c] = { ...data, fromCache: false };
    } catch (e) {
      results[c] = { error: e.message };
    }
  });

  const pricesPromise = fetchPricesFromCoinGecko();

  /* Wait for everything. Promise.all here is safe because every task
     already has its own try/catch and writes errors into results[c]
     rather than throwing. */
  const [, prices] = await Promise.all([Promise.all(coinPromises), pricesPromise]);

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
    case 'DGB': return fetchDGB();
    case 'XEC': return fetchXEC();
    case 'ALPH': return fetchALPH();
    case 'FB': return fetchFB();
    case 'BSV': return fetchBSV();
    case 'QUAI-SHA': return fetchQUAI_SHA();
    case 'QUAI-SCRYPT': return fetchQUAI_Scrypt();
    case 'ZEC': return fetchZEC();
    case 'BTC':
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
    case 'ETC':
      return fetchViaNowNodes(coin);
    default:
      throw new Error('Unsupported coin');
  }
}

/* ================= KAS (NOWNodes Kaspa REST) ================= */
/* Post-Crescendo (May 2025): 10 BPS, block_time = 0.1s.                */
/*                                                                      */
/* /info/network    -> returns difficulty (number) + blockCount (string) */
/*                    Does NOT return hashrate.                         */
/* /info/hashrate   -> returns {"hashrate": <TH/s as number>}            */
/* /info/blockreward -> returns {"blockreward": <KAS as number>}         */
/*                                                                      */
/* Verified live against NOWNodes 2026-04-25.                           */
/*                                                                      */
/* Strategy:                                                            */
/*   1. Fetch all 3 endpoints in parallel.                              */
/*   2. Use /info/hashrate value if available (most accurate).          */
/*   3. Fall back to difficulty / 0.1 if hashrate endpoint fails.       */
/*   4. Sanity-clamp final hashrate to 50-2000 PH/s (real Kaspa range). */
/*   5. Set hashrate_estimated honestly based on data source.           */

const KAS_BLOCK_TIME_SECONDS = 0.1;       // Post-Crescendo 10 BPS
const KAS_BLOCK_REWARD_FALLBACK = 2.91;   // Current dynamic subsidy as of 2026-04
const KAS_HASHRATE_MIN = 50e15;           // 50 PH/s sanity floor
const KAS_HASHRATE_MAX = 2000e15;         // 2 EH/s sanity ceiling

async function fetchKAS() {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const headers = { 'api-key': apiKey };
  const base = 'https://kas.nownodes.io';

  const [networkRes, hashrateRes, rewardRes] = await Promise.allSettled([
    fetch(`${base}/info/network`, { headers }).then(r => r.json()),
    fetch(`${base}/info/hashrate`, { headers }).then(r => r.json()),
    fetch(`${base}/info/blockreward`, { headers }).then(r => r.json())
  ]);

  const networkData = networkRes.status === 'fulfilled' ? networkRes.value : {};
  const difficulty = Number(networkData.difficulty) || 0;
  const height = Number(networkData.blockCount) || 0;

  let networkHashrate = 0;
  let hashrateEstimated = true;

  if (hashrateRes.status === 'fulfilled') {
    const liveHashrateTHs = Number(hashrateRes.value?.hashrate);
    if (Number.isFinite(liveHashrateTHs) && liveHashrateTHs > 0) {
      networkHashrate = liveHashrateTHs * 1e12;
      hashrateEstimated = false;
    }
  }

  if (networkHashrate === 0 && difficulty > 0) {
    networkHashrate = difficulty / KAS_BLOCK_TIME_SECONDS;
    hashrateEstimated = true;
  }

  if (networkHashrate < KAS_HASHRATE_MIN || networkHashrate > KAS_HASHRATE_MAX) {
    networkHashrate = 400e15;
    hashrateEstimated = true;
  }

  let blockReward = KAS_BLOCK_REWARD_FALLBACK;
  if (rewardRes.status === 'fulfilled') {
    const liveReward = Number(rewardRes.value?.blockreward);
    if (Number.isFinite(liveReward) && liveReward > 0 && liveReward < 60) {
      blockReward = liveReward;
    }
  }

  return {
    coin: 'KAS',
    difficulty,
    network_hashrate: networkHashrate,
    block_reward: blockReward,
    block_time: KAS_BLOCK_TIME_SECONDS,
    height,
    hashrate_estimated: hashrateEstimated
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
  let blockReward = 250.73; // fallback; on-chain subsidy at block 24,351,424 (2026-10-09) was 250.72839494
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

  // DGB SHA-256 difficulty jumps a lot within hours; pay math uses the
  // 24-hour average (WhatToMine coin 113 = DGB SHA-256), chain value as backup.
  const avgDifficulty = await wtmDifficulty24(113);

  return {
    coin: 'DGB',
    difficulty: sha256Difficulty,
    yield_difficulty: avgDifficulty || sha256Difficulty,
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
/* Miner keeps 1,812,500 of the 3,125,000 XEC block (58%; 32% miner fund, */
/* 10% staking). Verified on-chain 2026-10-09, block 970,231 coinbase.    */

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
      block_reward: 1812500,
      block_time: 600,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    // Blockchair failed: read eCash difficulty from WhatToMine (coin 370).
    // If that fails too, return an error so the calculator keeps its last good rate.
    const res2 = await fetch('https://whattomine.com/coins/370.json', { signal: AbortSignal.timeout(6000) });
    if (!res2.ok) throw new Error('XEC: Blockchair and WhatToMine both failed');
    const w = await res2.json();
    const difficulty = Number(w.difficulty) || 0;
    if (difficulty <= 0) throw new Error('XEC: no difficulty');
    return {
      coin: 'XEC',
      difficulty,
      network_hashrate: btcHashrate(difficulty, 600),
      block_reward: 1812500,
      block_time: 600,
      height: Number(w.last_block) || 0,
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
    const res = await fetch('https://backend.mainnet.alephium.org/blocks?page=1&limit=20');
    if (!res.ok) throw new Error(`Alephium backend returned ${res.status}`);
    const data = await res.json();

    const latestBlock = data?.blocks?.[0];
    if (!latestBlock) throw new Error('Alephium backend returned no blocks');

    // One block's hashRate is noisy; use the median of the last 20 blocks.
    const networkHashrate = median(data.blocks.map(b => Number(b.hashRate)));
    const height = Number(latestBlock.height) || 0;

    if (networkHashrate <= 0) throw new Error('Alephium returned zero hashrate');

    return {
      coin: 'ALPH',
      difficulty: 0,
      network_hashrate: networkHashrate,
      block_reward: 0.1433, // verified on-chain 2026-10-09 (0.143317807 ALPH coinbase)
      block_time: 0.5336,
      height,
      hashrate_estimated: false
    };
  } catch (e) {
    throw new Error(`ALPH fetch failed: ${e.message}`);
  }
}

/* ================= FB (Fractal Bitcoin mempool explorer API) ================= */
/* SHA-256. Fractal alternates two kinds of blocks:                        */
/*   - pool-mined (permissionless) blocks, difficulty ~1.1e9 — what an ASIC */
/*     pointed at an FB pool actually mines;                               */
/*   - blocks merge-mined with Bitcoin, difficulty ~8.8e12 (and some       */
/*     show difficulty 1 in the explorer).                                 */
/* Pay math uses the pool-mined difficulty: the median of those blocks     */
/* among the last 15. Reward is read from the same blocks (median coinbase */
/* minus fees), so it follows halvings by itself. The reward dropped from  */
/* 25 to 6.25 FB at block 2,100,000 (2026-09-08), verified on-chain.       */

const FB_BLOCK_TIME_SECONDS = 45; // observed average of pool-mined blocks, display only

function median(arr) {
  const a = arr.filter(x => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function fetchFB() {
  try {
    const res = await fetch('https://mempool.fractalbitcoin.io/api/v1/blocks');
    if (!res.ok) throw new Error(`Fractal explorer returned ${res.status}`);
    const blocks = await res.json();
    if (!Array.isArray(blocks) || !blocks.length) throw new Error('no blocks');

    // Pool-mined blocks: difficulty between 1e6 and 1e11 (merged blocks are ~1e13, or 1).
    const poolMined = blocks.filter(b => b.difficulty > 1e6 && b.difficulty < 1e11);
    const difficulty = median(poolMined.map(b => Number(b.difficulty)));
    if (!(difficulty > 0)) throw new Error('no pool-mined blocks in the last 15');

    // Subsidy = coinbase reward minus fees, in FB (explorer reports sats).
    const subsidy = median(blocks.map(b => {
      const r = Number(b.extras?.reward), f = Number(b.extras?.totalFees) || 0;
      return r > 0 ? (r - f) / 1e8 : 0;
    }));
    const blockReward = subsidy > 0 && subsidy <= 25 ? subsidy : 6.25;

    // Pay math uses the 24-hour average difficulty (WhatToMine coin 431);
    // the median of recent pool-mined blocks is the backup.
    return {
      coin: 'FB',
      difficulty,
      yield_difficulty: (await wtmDifficulty24(431)) || difficulty,
      network_hashrate: btcHashrate(difficulty, FB_BLOCK_TIME_SECONDS),
      block_reward: blockReward,
      block_time: FB_BLOCK_TIME_SECONDS,
      height: Number(blocks[0].height) || 0,
      hashrate_estimated: true
    };
  } catch (e) {
    throw new Error(`FB fetch failed: ${e.message}`);
  }
}

/* ================= ZEC (NOWNodes Zcash JSON-RPC, direct) ================= */
/* Equihash. Reads live from the Zcash node RPC only — NO Blockbook hop.      */
/*                                                                            */
/*   getmininginfo   -> difficulty, networksolps (network Sol/s), blocks       */
/*   getblocksubsidy -> live block reward. We use the MINER's share (what      */
/*                      actually hits the wallet), so the number reflects real  */
/*                      earnings and self-updates at every halving — no more    */
/*                      hardcoded reward to maintain.                          */
/*                                                                            */
/* block_time is the protocol target (75s, post-Blossom) — a fixed constant.  */

const ZEC_BLOCK_TIME_SECONDS = 75;
// Miner's take-home per block right now (post-Nov-2024 halving). Used ONLY if
// the live getblocksubsidy call fails — the live value is preferred.
const ZEC_MINER_REWARD_FALLBACK = 1.25;

async function fetchZEC() {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const rpc = (method, params = []) => fetch('https://zec.nownodes.io', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'zec-mining', method, params })
  }).then(r => r.json());

  // One call gives difficulty + height + network Sol/s; the other gives the
  // live block reward. Run them together.
  const [miningRes, subsidyRes] = await Promise.allSettled([
    rpc('getmininginfo'),
    rpc('getblocksubsidy')      // no height arg => current chain height
  ]);

  // --- difficulty / network Sol/s / height (required) ---
  if (miningRes.status !== 'fulfilled' || !miningRes.value || miningRes.value.error) {
    throw new Error('ZEC getmininginfo failed');
  }
  const mi = miningRes.value.result || {};
  const difficulty = Number(mi.difficulty) || 0;
  const height = Number(mi.blocks) || 0;
  // Equihash network speed is solutions/sec (networksolps). networkhashps is
  // deprecated in current Zcash, so it's only a last-ditch fallback.
  const networkHashrate = Number(mi.networksolps) || Number(mi.networkhashps) || 0;

  // --- live block reward = the MINER's share (not the gross subsidy) ---
  // getblocksubsidy returns `miner` after the ~20% dev-fund/lockbox is removed.
  let blockReward = ZEC_MINER_REWARD_FALLBACK;
  if (subsidyRes.status === 'fulfilled' && subsidyRes.value && !subsidyRes.value.error) {
    const s = subsidyRes.value.result || {};
    const minerShare = Number(s.miner);
    // Sanity clamp — the real miner reward sits comfortably inside this band.
    if (Number.isFinite(minerShare) && minerShare >= 0.1 && minerShare <= 10) {
      blockReward = minerShare;
    }
  }

  return {
    coin: 'ZEC',
    difficulty,
    yield_difficulty: (await wtmDifficulty24(166)) || difficulty,
    network_hashrate: networkHashrate,
    block_reward: blockReward,
    block_time: ZEC_BLOCK_TIME_SECONDS,
    height,
    hashrate_estimated: false
  };
}

/* ================= NOWNODES BLOCKBOOK COINS (7 coins) ================= */

async function fetchViaNowNodes(coin) {
  const apiKey = process.env.NOWNODES_API_KEY;
  if (!apiKey) throw new Error('Missing NOWNodes API key');

  const endpoints = {
    BTC: 'https://btcbook.nownodes.io/api/v2',
    LTC: 'https://ltcbook.nownodes.io/api/v2',
    DOGE: 'https://dogebook.nownodes.io/api/v2',
    BCH: 'https://bchbook.nownodes.io/api/v2',
    DASH: 'https://dashbook.nownodes.io/api/v2',
    ETC: 'https://etc-blockbook.nownodes.io/api/v2',
    ZEC: 'https://zecbook.nownodes.io/api/v2'
  };

  const blockRewards = {
    BTC: 3.125,
    LTC: 6.25,
    DOGE: 10000,
    BCH: 3.125,
    DASH: 0.411,  // miner's share only; verified block 2,552,159 (2026-10-09): miner 0.41101891 of 1.6441
    ETC: 1.6384,  // era 6 (from block 25,000,000, 2026-07-22); live value comes from etcEraReward()
    ZEC: 1.25
  };

  const blockTimes = {
    BTC: 600,
    LTC: 150,
    DOGE: 60,
    BCH: 600,
    DASH: 156,
    ETC: 13.46,
    ZEC: 75
  };

  /* ETC: read live difficulty/height from the JSON-RPC node (etc.nownodes.io)
     instead of the Blockbook indexer. Blockbook's /api/v2 root returns a
     status page where backend.difficulty reflects the indexer's backing node
     state, which can lag the real chain significantly. JSON-RPC's
     eth_getBlockByNumber("latest") is the documented source for current
     block data. If the JSON-RPC call fails for any reason we fall through
     to the original Blockbook code path below. */
  // ETC block reward by era (ECIP-1017): 5 ETC, x0.8 every 5,000,000 blocks.
  // Block 24,999,999 paid 2.048; block 25,000,000 paid 1.6384 (verified on-chain).
  const etcEraReward = (h) => 5 * Math.pow(0.8, Math.floor(h / 5000000));

  if (coin === 'ETC') {
    try {
      const rpcRes = await fetch('https://etc.nownodes.io', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
          id: 1
        })
      });
      const rpcData = await rpcRes.json();
      const diffHex = rpcData.result?.difficulty;
      const heightHex = rpcData.result?.number;
      if (diffHex && heightHex) {
        const difficulty = Number(BigInt(diffHex));
        const height = Number(BigInt(heightHex));
        const networkHashrate = difficulty / blockTimes.ETC;
        return {
          coin: 'ETC',
          difficulty,
          yield_difficulty: (await wtmDifficulty24(162)) || difficulty,
          network_hashrate: networkHashrate,
          block_reward: etcEraReward(height),
          block_time: blockTimes.ETC,
          height,
          hashrate_estimated: false
        };
      }
    } catch (e) {
      // JSON-RPC failed; fall through to Blockbook fallback below
    }
  }

  const res = await fetch(endpoints[coin], {
    headers: { 'api-key': apiKey }
  });

  const data = await res.json();
  const difficulty = Number(data.backend?.difficulty) || 0;

  // Estimate hashrate from difficulty for coins that support it
  // ETC uses Ethash difficulty (no 2^32 factor)
  // ZEC uses Equihash which needs 2^13 factor instead of 2^32
  let networkHashrate = 0;
  let hashEstimated = false;

  // ZEC and DASH expose direct network hashrate via RPC getmininginfo —
  // more accurate than difficulty-derived estimates. Try RPC first, fall back.
  if (coin === 'ZEC' || coin === 'DASH') {
    const rpcEndpoint = coin === 'ZEC'
      ? 'https://zec.nownodes.io'
      : 'https://dash.nownodes.io';
    try {
      const rpcRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: 'mining-stats',
          method: 'getmininginfo',
          params: []
        })
      });
      const rpcData = await rpcRes.json();
      // ZEC: networksolps (Sol/sec). DASH: networkhashps (H/sec).
      const rpcHashrate = coin === 'ZEC'
        ? Number(rpcData.result?.networksolps)
        : Number(rpcData.result?.networkhashps);
      if (rpcHashrate > 0) {
        networkHashrate = rpcHashrate;
        hashEstimated = false;
      }
    } catch (e) {
      // RPC failed — fall through to difficulty-based estimate below
    }
  }

  // Fall back to difficulty-derived estimate if RPC didn't give us a value
  if (networkHashrate === 0) {
    if (coin === 'ZEC') {
      networkHashrate = (difficulty * Math.pow(2, 13)) / blockTimes[coin];
      hashEstimated = true;
    } else if (coin === 'ETC') {
      // Ethereum-family: hashrate = difficulty / block_time (no 2^32 factor)
      networkHashrate = difficulty / blockTimes[coin];
      hashEstimated = true;
    } else {
      networkHashrate = btcHashrate(difficulty, blockTimes[coin]);
      hashEstimated = true;
    }
  }

  // DOGE, DASH and ETC difficulty swings 10-40% within a day; pay math uses
  // the 24-hour average from WhatToMine (coins 6, 34, 162), chain value as backup.
  const AVG_IDS = { DOGE: 6, DASH: 34, ETC: 162 };
  const yieldDifficulty = AVG_IDS[coin] ? (await wtmDifficulty24(AVG_IDS[coin])) || difficulty : difficulty;
  const height = Number(data.backend?.blocks) || 0;

  return {
    coin,
    difficulty,
    yield_difficulty: yieldDifficulty,
    network_hashrate: networkHashrate,
    block_reward: coin === 'ETC' && height > 0 ? etcEraReward(height) : blockRewards[coin],
    block_time: blockTimes[coin],
    height,
    hashrate_estimated: hashEstimated
  };
}

/* ================= BSV (WhatsOnChain public API) ================= */
/* SHA-256, same hardware as BTC/BCH. Target block time 600s.           */
/* Reward 3.125 BSV since the April 2024 halving (block 840,000); next  */
/* halving at block 1,050,000. Verified on-chain 2026-10-07: block      */
/* 970,100 coinbase paid 3.1261 BSV (3.125 subsidy + fees).             */
/* API: api.whatsonchain.com/v1/bsv/main/chain/info (no key needed).    */

const BSV_BLOCK_TIME = 600;
const BSV_HASHRATE_MIN = 10e15;    // 10 PH/s sanity floor
const BSV_HASHRATE_MAX = 10e18;    // 10 EH/s sanity ceiling

function bsvBlockReward(height) {
  const halvings = Math.floor(height / 210000);
  return 50 / Math.pow(2, halvings);
}

async function fetchBSV() {
  try {
    const res = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    if (!res.ok) throw new Error(`WhatsOnChain returned ${res.status}`);
    const data = await res.json();
    const difficulty = Number(data.difficulty) || 0;
    const height = Number(data.blocks) || 0;
    if (difficulty <= 0 || height <= 0) throw new Error('WhatsOnChain returned no difficulty');
    const networkHashrate = btcHashrate(difficulty, BSV_BLOCK_TIME);
    if (networkHashrate < BSV_HASHRATE_MIN || networkHashrate > BSV_HASHRATE_MAX) {
      throw new Error(`BSV hashrate ${networkHashrate} outside sanity range`);
    }
    return {
      coin: 'BSV',
      difficulty,
      network_hashrate: networkHashrate,
      block_reward: bsvBlockReward(height),
      block_time: BSV_BLOCK_TIME,
      height,
      hashrate_estimated: true
    };
  } catch (e) {
    throw new Error(`BSV fetch failed: ${e.message}`);
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
    // QUAI's reward moves with difficulty, so pay math uses WhatToMine's
    // 24-hour reward and 24-hour difficulty to keep the number steady.
    const blockReward = Number(data.block_reward24) || Number(data.block_reward) || 4.79;
    const yieldDifficulty = Number(data.difficulty24) || difficulty;

    if (networkHashrate <= 0) throw new Error('WhatToMine QUAI-SHA returned zero hashrate');

    return {
      coin: 'QUAI-SHA',
      difficulty,
      yield_difficulty: yieldDifficulty,
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
    // QUAI's reward moves with difficulty, so pay math uses WhatToMine's
    // 24-hour reward and 24-hour difficulty to keep the number steady.
    const blockReward = Number(data.block_reward24) || Number(data.block_reward) || 4.83;
    const yieldDifficulty = Number(data.difficulty24) || difficulty;

    if (networkHashrate <= 0) throw new Error('WhatToMine QUAI-SCRYPT returned zero hashrate');

    return {
      coin: 'QUAI-SCRYPT',
      difficulty,
      yield_difficulty: yieldDifficulty,
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
