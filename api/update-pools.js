// /api/update-pools.js
// Phase 1: Fetches MinerStat /v2/pools and caches to /tmp/
// Called by cron-job.org weekly (Sunday midnight CST)
// Protected by CRON_SECRET header — never called by visitors

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-pools.json');

module.exports = async function handler(req, res) {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.MINERSTAT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MINERSTAT_API_KEY not configured' });
  }

  try {
    const url = `https://api.minerstat.com/v2/pools?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();

    // rawData is an object keyed by pool name, each containing pool details
    // Keep the structure as-is but add metadata
    const cachePayload = {
      data: rawData,
      fetched_at: new Date().toISOString(),
      pool_count: typeof rawData === 'object' ? Object.keys(rawData).length : 0
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload));

    return res.status(200).json({
      success: true,
      message: `Cached ${cachePayload.pool_count} pools`,
      fetched_at: cachePayload.fetched_at
    });

  } catch (error) {
    console.error('update-pools error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
