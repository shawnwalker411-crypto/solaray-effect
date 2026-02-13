// /api/get-coins.js
// Serves cached MinerStat coin data to the frontend calculator
// Self-healing: if cache is cold (Vercel recycled /tmp), fetches once and caches
// Rate-limited by cache age — will NOT re-fetch more than once per 4 hours
// Visitors call THIS endpoint only — cron keeps it warm via update-coins.js
//
// Returns pre-calculated perUnit values (coins per [unit] per day)
// for: ZEC, XMR, ALPH, DGB, CKB, SC, KDA
// The 9 "live" coins are NOT included — they use /api/mining-stats

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-coins.json');
const MIN_CACHE_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

// Same config as update-coins.js for self-healing fetch
const MINERSTAT_COINS = {
  ZEC:  { algorithm: 'Equihash',    unit: 'kSol/s', multiplier: 1e3 * 24 },
  XMR:  { algorithm: 'RandomX',     unit: 'KH/s',   multiplier: 1e3 * 24 },
  ALPH: { algorithm: 'Blake3',      unit: 'GH/s',   multiplier: 1e9 * 24 },
  DGB:  { algorithm: 'Scrypt',      unit: 'MH/s',   multiplier: 1e6 * 24 },
  CKB:  { algorithm: 'Eaglesong',   unit: 'GH/s',   multiplier: 1e9 * 24 },
  SC:   { algorithm: 'Blake2b-Sia', unit: 'GH/s',   multiplier: 1e9 * 24 },
  KDA:  { algorithm: 'Blake2s',     unit: 'GH/s',   multiplier: 1e9 * 24 }
};

const WANTED_SYMBOLS = Object.keys(MINERSTAT_COINS);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  // Try to read existing cache first
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const cached = JSON.parse(raw);
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();

      // Cache is fresh enough — serve it
      if (ageMs < MIN_CACHE_AGE_MS) {
        return res.status(200).json({
          success: true,
          source: 'cache',
          data: cached.data,
          meta: {
            fetched_at: cached.fetched_at,
            coin_count: cached.coin_count,
            age_minutes: Math.round(ageMs / 60000),
            stale: false
          }
        });
      }

      // Cache exists but is old — still serve it (stale), let cron fix it
      if (ageMs < 48 * 60 * 60 * 1000) {
        return res.status(200).json({
          success: true,
          source: 'cache_stale',
          data: cached.data,
          meta: {
            fetched_at: cached.fetched_at,
            coin_count: cached.coin_count,
            age_minutes: Math.round(ageMs / 60000),
            stale: true
          }
        });
      }
    }
  } catch (readError) {
    console.error('Cache read error:', readError.message);
  }

  // Cache is missing or very old (>48h) — self-heal with a fresh fetch
  // This costs 1 API call but only happens on cold starts
  const apiKey = process.env.MINERSTAT_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'no_cache',
      message: 'No cache available and no API key configured',
      data: null
    });
  }

  try {
    const coinList = WANTED_SYMBOLS.join(',');
    const url = `https://api.minerstat.com/v2/coins?key=${apiKey}&list=${coinList}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}`);
    }

    const rawData = await response.json();

    // Process into our format (same logic as update-coins.js)
    const processed = {};
    let matchCount = 0;

    if (Array.isArray(rawData)) {
      for (const coin of rawData) {
        const sym = coin.coin;
        const config = MINERSTAT_COINS[sym];
        if (!config) continue;
        if (coin.algorithm !== config.algorithm) continue;

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
          raw_reward: coin.reward
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

    // Write cache for next request
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload));

    return res.status(200).json({
      success: true,
      source: 'fresh_fetch',
      data: cachePayload.data,
      meta: {
        fetched_at: cachePayload.fetched_at,
        coin_count: matchCount,
        age_minutes: 0,
        stale: false
      }
    });

  } catch (fetchError) {
    console.error('MinerStat self-heal fetch error:', fetchError.message);
    return res.status(200).json({
      success: false,
      error: 'fetch_failed',
      message: 'No cache and fetch failed: ' + fetchError.message,
      data: null
    });
  }
};
