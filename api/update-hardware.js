// /api/update-hardware.js
// Fetches MinerStat /v2/hardware and caches to /tmp/
// Called by cron-job.org monthly (1st of each month)
// Protected by CRON_SECRET header \u2014 never called by visitors
// NOTE: Free tier returns truncated/incomplete data (missing S19 Pro, KS5, etc.)
// This is supplemental data only \u2014 the manually curated catalog is primary.

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join('/tmp', 'minerstat-hardware.json');

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
    const url = `https://api.minerstat.com/v2/hardware?key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`MinerStat API returned ${response.status}: ${response.statusText}`);
    }

    const rawData = await response.json();

    const cachePayload = {
      data: rawData,
      fetched_at: new Date().toISOString(),
      entry_count: Array.isArray(rawData) ? rawData.length : Object.keys(rawData).length,
      note: 'Free tier \u2014 incomplete data. Supplemental use only.'
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachePayload));

    return res.status(200).json({
      success: true,
      message: `Cached ${cachePayload.entry_count} hardware entries (free tier, incomplete)`,
      fetched_at: cachePayload.fetched_at
    });

  } catch (error) {
    console.error('update-hardware error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
