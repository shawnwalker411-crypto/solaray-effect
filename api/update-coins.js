// /api/update-coins.js
// Fetches MinerStat /v2/coins and caches to /tmp/
// Called by cron-job.org 3x daily (6am, 2pm, 10pm CST)
// Protected by CRON_SECRET header — never called by visitors
//
// ONLY serves coins that have NO existing live data source:
//   ZEC (Equihash), XMR (RandomX), ALPH (Blake3)
//   + new coins: DGB (Scrypt), CKB (Eaglesong), SC (Blake2b-Sia), KDA (Blake2s)
//
// The 9 "live" coins (BTC, BCH, LTC, DOGE, KAS, ETC, DASH, RVN, ERG)
// keep their existing /api/mining-stats sources — this endpoint does NOT touch them.

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-coins.json');

// Only these coins get served from Minerstat
// Maps coin symbol → { algorithm, unit, multiplier }
// multiplier converts Minerstat's "per 1 H/s per 1 hour" to "per [unit] per day"
const MINERSTAT_COINS = {
  ZEC:  { algorithm: 'Equihash',    unit: 'kSol/s', multiplier: 1e3 * 24 },
  XMR:  { algorithm: 'RandomX',     unit: 'KH/s',   multiplier: 1e3 * 24 },
  ALPH: { algorithm: 'Blake3',      unit: 'GH/s',   multiplier: 1e9 * 24 },
  DGB:  { algorithm: 'Scrypt',      unit: 'MH/s',   multiplier: 1e6 * 24 },  // Scrypt entry only
  CKB:  { algorithm: 'Eaglesong',   unit: 'GH/s',   multiplier: 1e9 * 24 },
  SC:   { algorithm: 'Blake2b-Sia', unit: 'GH/s',   multiplier: 1e9 * 24 },
  KDA:  { algorithm: 'Blake2s',     unit: 'GH/s',   multiplier: 1e9 * 24 }
};

const WANTED_SYMBOLS = Object.keys(MINERSTAT_COINS);

module.exports = async function handler(req, res) {
  // Only allow POST (from cron) or GET with secret
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.MINERSTAT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MINERSTAT_API_KEY not configured' });
  }

  try {
    // Fetch only our target coins using the list filter
    const coinList = WANTED_SYMBOLS.join(',');
    const url = `https://api.minerstat.com/v2/coins?key=${apiKey}&list=${coinList}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();

    // Process into our format: { ZEC: { perUnit, price, ... }, XMR: { ... } }
    const processed = {};
    let matchCount = 0;

    if (Array.isArray(rawData)) {
      for (const coin of rawData) {
        const sym = coin.coin;
        const config = MINERSTAT_COINS[sym];

        // Only process coins we want, matching the expected algorithm
        if (!config) continue;
        if (coin.algorithm !== config.algorithm) {
          // DGB has multiple algos — skip non-Scrypt entries
          continue;
        }

        // Convert: Minerstat reward (per 1 H/s per 1 hour) → per [unit] per day
        const perUnit = (coin.reward || 0) * config.multiplier;

        processed[sym] = {
          coin: sym,
          algorithm: coin.algorithm,
          unit: config.unit,
          perUnit: perUnit,
          price: coin.price || 0,
          network_hashrate: coin.network_hashrate || 0,
          difficulty: coin.difficulty || 0,
          reward_block: coin.reward_block || 0,
          raw_reward: coin.reward  // keep original for debugging
        };
        matchCount++;
      }
    }

    const cachePayload = {
      data: processed,
      fetched_at: new Date().toISOString(),
      coin_count: matchCount,
      raw_entries: Array.isArray(rawData) ? rawData.length : 0
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload));

    return res.status(200).json({
      success: true,
      message: `Cached ${matchCount} coins from ${cachePayload.raw_entries} entries`,
      fetched_at: cachePayload.fetched_at,
      coins: Object.keys(processed)
    });

  } catch (error) {
    console.error('update-coins error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
