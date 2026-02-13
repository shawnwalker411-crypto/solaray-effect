// Vercel Serverless Function: /api/mining-stats.js
// Fetches live mining difficulty/hashrate data with 48-hour caching
// Ground truth validated against WhatToMine 2/13/2026

let cache = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const { coin, refresh } = req.query;
  const CACHE_DURATION = 48 * 60 * 60 * 1000;
  
  const coinsToFetch = coin ? [coin.toUpperCase()] : ['BTC', 'LTC', 'DOGE', 'KAS', 'BCH', 'DASH', 'ETC', 'RVN', 'ERG', 'ZEC', 'XMR', 'CKB', 'DGB'];
  
  const results = {};
  
  for (const c of coinsToFetch) {
    if (!refresh && cache[c] && (Date.now() - cache[c].timestamp < CACHE_DURATION)) {
      results[c] = { ...cache[c], fromCache: true };
      continue;
    }
    
    try {
      const data = await fetchCoinData(c);
      cache[c] = { ...data, timestamp: Date.now() };
      results[c] = { ...data, fromCache: false };
    } catch (error) {
      console.error(`Error fetching ${c}:`, error.message);
      if (cache[c]) {
        results[c] = { ...cache[c], fromCache: true, stale: true };
      } else {
        results[c] = { error: error.message };
      }
    }
  }
  
  return res.status(200).json({
    success: true,
    cache_duration_hours: 48,
    data: coin ? results[coin.toUpperCase()] : results
  });
}

async function fetchCoinData(coin) {
  const NOWNODES_KEY = process.env.NOWNODES_API_KEY;
  
  switch (coin) {
    case 'BTC':   return await fetchBTC();
    case 'KAS':   return await fetchKAS();
    case 'ETC':   return await fetchETC();
    case 'ERG':   return await fetchERG();
    case 'RVN':   return await fetchRVN();
    case 'ZEC':   return await fetchZEC();
    case 'XMR':   return await fetchXMR();
    case 'CKB':   return await fetchCKB();
    case 'DGB':   return await fetchDGB();
    case 'LTC':
    case 'DOGE':
    case 'BCH':
    case 'DASH':
      return await fetchViaNowNodes(coin, NOWNODES_KEY);
    default:
      throw new Error(`Unsupported coin: ${coin}`);
  }
}

// BTC via blockchain.info — VERIFIED ✅
async function fetchBTC() {
  const [diffRes, heightRes] = await Promise.all([
    fetch('https://blockchain.info/q/getdifficulty'),
    fetch('https://blockchain.info/q/getblockcount')
  ]);
  
  const difficulty = parseFloat(await diffRes.text());
  const height = parseInt(await heightRes.text());
  const networkHashrate = (difficulty * Math.pow(2, 32)) / 600;
  
  return {
    coin: 'BTC',
    difficulty,
    network_hashrate: networkHashrate,
    height,
    block_reward: 3.125,
    block_time: 600,
    timestamp: Date.now(),
    source: 'blockchain.info'
  };
}

// KAS via Kaspa API — FIXED: hashrate was 0, reward/time wrong
// WTM: reward ~3.27, block_time 0.1s
async function fetchKAS() {
  let hashrate = 0;
  try {
    const hashRes = await fetch('https://api.kaspa.org/info/hashrate?stringOnly=false');
    const hashData = await hashRes.json();
    hashrate = hashData.hashrate || 0;
  } catch (e) {}
  
  const res = await fetch('https://api.kaspa.org/info/network');
  const data = await res.json();
  
  if (!hashrate && data.difficulty) {
    hashrate = data.difficulty * 2;
  }
  
  return {
    coin: 'KAS',
    difficulty: data.difficulty || 0,
    network_hashrate: hashrate,
    height: data.blockCount || 0,
    block_reward: 3.27,
    block_time: 0.1,
    timestamp: Date.now(),
    source: 'api.kaspa.org'
  };
}

// ETC via Blockchair — FIXED: old RPC returned garbage
// WTM: difficulty ~2.5 PH, nethash ~185 TH/s, reward 1.987, time 13.5s
async function fetchETC() {
  const res = await fetch('https://api.blockchair.com/ethereum-classic/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'ETC',
    difficulty: parseFloat(data.difficulty) || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 1.987,
    block_time: 13.5,
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// ERG via Ergo Platform — hashrate calculated from difficulty
async function fetchERG() {
  const res = await fetch('https://api.ergoplatform.com/api/v1/networkState');
  const data = await res.json();
  
  const difficulty = data.difficulty || 0;
  const networkHashrate = difficulty / 120;
  
  return {
    coin: 'ERG',
    difficulty,
    network_hashrate: networkHashrate,
    height: data.height || 0,
    block_reward: 27,
    block_time: 120,
    timestamp: Date.now(),
    source: 'ergoplatform.com'
  };
}

// RVN via Blockchair — FIXED: NOWNodes returned HTML
async function fetchRVN() {
  const res = await fetch('https://api.blockchair.com/ravencoin/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'RVN',
    difficulty: parseFloat(data.difficulty) || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 2500,
    block_time: 60,
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// ZEC via Blockchair — FIXED: reward was 2.5, miners get 1.25
async function fetchZEC() {
  const res = await fetch('https://api.blockchair.com/zcash/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'ZEC',
    difficulty: data.difficulty || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 1.25,
    block_time: 75,
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// XMR via Blockchair — VERIFIED ✅
async function fetchXMR() {
  const res = await fetch('https://api.blockchair.com/monero/stats');
  const json = await res.json();
  const data = json.data;
  
  return {
    coin: 'XMR',
    difficulty: parseFloat(data.difficulty) || 0,
    network_hashrate: parseFloat(data.hashrate_24h) || 0,
    hashrate_24h: parseFloat(data.hashrate_24h) || 0,
    height: data.best_block_height || 0,
    block_reward: 0.6,
    block_time: 120,
    timestamp: Date.now(),
    source: 'blockchair.com'
  };
}

// CKB via Nervos Explorer — FIXED: hashrate wrong, reward/time wrong
// WTM: nethash ~184 PH/s, reward ~1036, time ~10.27s
async function fetchCKB() {
  const res = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics', {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    }
  });
  const json = await res.json();
  const attrs = json.data?.attributes || {};
  
  const difficulty = parseFloat(attrs.current_epoch_difficulty) || 0;
  const height = parseInt(attrs.tip_block_number) || 0;
  const avgBlockTime = parseFloat(attrs.average_block_time) || 10270;
  const blockTimeSec = avgBlockTime / 1000;
  
  // Calculate hashrate from difficulty / block_time (Eaglesong)
  const networkHashrate = difficulty / blockTimeSec;
  
  return {
    coin: 'CKB',
    difficulty,
    network_hashrate: networkHashrate,
    hash_rate: networkHashrate,
    height,
    block_reward: 1036,
    block_time: blockTimeSec,
    timestamp: Date.now(),
    source: 'explorer.nervos.org'
  };
}

// DGB-Scrypt via chainz.cryptoid.info — FIXED: reward/time wrong
// DGB has 5 algos, Scrypt gets 1/5 of blocks
// WTM: reward 274.28 per Scrypt block, block_time 75s
async function fetchDGB() {
  const [diffRes, hashRes, heightRes] = await Promise.all([
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getdifficulty'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=nethashps'),
    fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getblockcount')
  ]);
  
  const difficulty = parseFloat(await diffRes.text()) || 0;
  const networkHashrate = parseFloat(await hashRes.text()) || 0;
  const height = parseInt(await heightRes.text()) || 0;
  
  return {
    coin: 'DGB',
    difficulty,
    network_hashrate: networkHashrate,
    height,
    block_reward: 274.28,
    block_time: 75,
    timestamp: Date.now(),
    source: 'chainz.cryptoid.info'
  };
}

// NOWNodes: LTC, DOGE, BCH, DASH — ALL VERIFIED ✅
async function fetchViaNowNodes(coin, apiKey) {
  if (!apiKey) throw new Error('NOWNodes API key not configured');
  
  const endpoints = {
    LTC: 'https://ltcbook.nownodes.io/api/v2',
    DOGE: 'https://dogebook.nownodes.io/api/v2',
    BCH: 'https://bchbook.nownodes.io/api/v2',
    DASH: 'https://dashbook.nownodes.io/api/v2'
  };
  
  const blockRewards = {
    LTC: 6.25,
    DOGE: 10000,
    BCH: 3.125,
    DASH: 0.4426
  };
  
  const blockTimes = {
    LTC: 150,
    DOGE: 60,
    BCH: 600,
    DASH: 150
  };
  
  const baseUrl = endpoints[coin];
  if (!baseUrl) throw new Error(`No endpoint for ${coin}`);
  
  const res = await fetch(baseUrl, {
    headers: { 'api-key': apiKey }
  });
  
  const data = await res.json();
  
  const difficulty = parseFloat(data.backend?.difficulty || data.difficulty || 0);
  const height = parseInt(data.backend?.blocks || data.blockbook?.bestHeight || 0);
  const blockTime = blockTimes[coin] || 60;
  const networkHashrate = (difficulty * Math.pow(2, 32)) / blockTime;
  
  return {
    coin,
    difficulty,
    network_hashrate: networkHashrate,
    height,
    block_reward: blockRewards[coin] || 0,
    block_time: blockTime,
    timestamp: Date.now(),
    source: 'nownodes.io'
  };
}
