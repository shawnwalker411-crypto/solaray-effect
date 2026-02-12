// /api/get-coins.js
// Phase 1: Serves cached MinerStat coin data to the frontend
// This is the ONLY endpoint visitors call — it NEVER contacts MinerStat
// Returns cached data from /tmp/ written by update-coins.js

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-coins.json');

// Maximum age before data is considered stale (12 hours)
// Cron runs 3x daily so this should never trigger, but just in case
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  // Set CORS and cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return res.status(200).json({
        success: false,
        error: 'no_cache',
        message: 'Cache not yet populated. Waiting for first cron run.',
        data: null
      });
    }

    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cached = JSON.parse(raw);

    // Check freshness
    const fetchedAt = new Date(cached.fetched_at);
    const ageMs = Date.now() - fetchedAt.getTime();
    const stale = ageMs > MAX_AGE_MS;

    return res.status(200).json({
      success: true,
      data: cached.data,
      meta: {
        fetched_at: cached.fetched_at,
        coin_count: cached.coin_count,
        age_minutes: Math.round(ageMs / 60000),
        stale: stale
      }
    });

  } catch (error) {
    console.error('get-coins error:', error.message);
    return res.status(200).json({
      success: false,
      error: 'cache_read_error',
      message: error.message,
      data: null
    });
  }
};
