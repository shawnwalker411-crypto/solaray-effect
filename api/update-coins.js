// /api/update-coins.js
// Phase 1: Fetches MinerStat /v2/coins and caches to /tmp/
// Called by cron-job.org 3x daily (6am, 2pm, 10pm CST)
// Protected by CRON_SECRET header — never called by visitors

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-coins.json');

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
    const url = `https://api.minerstat.com/v2/coins?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();

    // rawData is an array of coin objects — index by coin symbol for fast lookup
    const coinMap = {};
    if (Array.isArray(rawData)) {
      for (const coin of rawData) {
        if (coin.coin) {
          // Store by coin symbol (BTC, LTC, etc.)
          // If multiple entries per coin (different algos), keep all under coin symbol
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
            reward: coin.reward,           // coins per 1 H/s per 1 hour
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

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload));

    return res.status(200).json({
      success: true,
      message: `Cached ${cachePayload.coin_count} coins (${cachePayload.raw_entries} entries)`,
      fetched_at: cachePayload.fetched_at
    });

  } catch (error) {
    console.error('update-coins error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
