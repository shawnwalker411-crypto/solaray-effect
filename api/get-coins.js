// /api/get-coins.js
// Phase 1: Serves cached MinerStat coin data to the frontend
// Self-healing: if cache is cold (Vercel recycled container), fetches once and caches
// Rate-limited by cache age — will NOT fetch more than once per 4 hours even under load
// Visitors call THIS endpoint only — cron keeps it warm via update-coins.js

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-coins.json');
const MIN_CACHE_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours — won't re-fetch before this

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

      // Cache exists but is old — still serve it, but try to refresh in background
      // For now, serve stale and let cron fix it (don't block the response)
      if (ageMs < 24 * 60 * 60 * 1000) {
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
    // Fall through to fetch
  }

  // Cache is missing or very old (>24h) — fetch fresh data
  // This should only happen on cold starts or if cron hasn't run
  const apiKey = process.env.MINERSTAT_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'no_api_key',
      message: 'MINERSTAT_API_KEY not configured and no cache available',
      data: null
    });
  }

  try {
    const url = `https://api.minerstat.com/v2/coins?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}`);
    }

    const rawData = await response.json();

    // Index by coin symbol
    const coinMap = {};
    if (Array.isArray(rawData)) {
      for (const coin of rawData) {
        if (coin.coin) {
          if (!coinMap[coin.coin]) {
            coinMap[coin.coin] = [];
          }
          coinMap[coin.coin].push({
            coin: coin.coin,
            name: coin.name,
            algorithm: coin.algorithm,
            price: coin.price,
            volume: coin.volume,
            network_hashrate: coin.network_hashrate,
            difficulty: coin.difficulty,
            reward: coin.reward,
            reward_block: coin.reward_block
          });
        }
      }
    }

    const cachePayload = {
      data: coinMap,
      fetched_at: new Date().toISOString(),
      coin_count: Object.keys(coinMap).length,
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
        coin_count: cachePayload.coin_count,
        age_minutes: 0,
        stale: false
      }
    });

  } catch (fetchError) {
    console.error('MinerStat fetch error:', fetchError.message);
    return res.status(200).json({
      success: false,
      error: 'fetch_failed',
      message: 'No cache available and MinerStat fetch failed: ' + fetchError.message,
      data: null
    });
  }
};
