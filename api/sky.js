// /api/sky.js
// Sola's Nightscape data aggregator
// Fans out to Solar System OpenData + NASA APOD + NeoWs + DONKI, caches for 1 hour
// Browser calls /api/sky?lat=32.8&lon=-97.1 and gets one combined JSON payload

const fs = require('fs');
const path = require('path');

const CACHE_DIR = '/tmp';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/* ============================================================
   MAIN HANDLER
   ============================================================ */
module.exports = async function handler(req, res) {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid lat/lon query parameters'
    });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      success: false,
      error: 'lat/lon out of range'
    });
  }

  const cacheKey = `sky_${lat.toFixed(1)}_${lon.toFixed(1)}`;
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

  if (req.query.refresh !== '1') {
    try {
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          return res.status(200).json({
            ...cached.payload,
            fromCache: true,
            cacheAge: Math.round((Date.now() - cached.timestamp) / 1000)
          });
        }
      }
    } catch (e) {
      // cache read failed - proceed to fresh fetch
    }
  }

  // Fan out to all 4 APIs in parallel
  const [skyResult, apodResult, neowsResult, donkiResult] = await Promise.allSettled([
    fetchSolarSystemPositions(lat, lon),
    fetchAPOD(),
    fetchNeoWs(),
    fetchDONKI()
  ]);

  const payload = {
    success: true,
    location: { lat, lon },
    fetched_at: new Date().toISOString(),
    planets: skyResult.status === 'fulfilled' ? skyResult.value.planets : [],
    moon: skyResult.status === 'fulfilled' ? skyResult.value.moon : null,
    sun: skyResult.status === 'fulfilled' ? skyResult.value.sun : null,
    apod: apodResult.status === 'fulfilled' ? apodResult.value : null,
    asteroids: neowsResult.status === 'fulfilled' ? neowsResult.value : [],
    spaceWeather: donkiResult.status === 'fulfilled' ? donkiResult.value : [],
    errors: {
      solsys: skyResult.status === 'rejected' ? skyResult.reason?.message || 'Failed' : null,
      apod: apodResult.status === 'rejected' ? apodResult.reason?.message || 'Failed' : null,
      neows: neowsResult.status === 'rejected' ? neowsResult.reason?.message || 'Failed' : null,
      donki: donkiResult.status === 'rejected' ? donkiResult.reason?.message || 'Failed' : null
    }
  };

  try {
    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      payload
    }));
  } catch (e) {
    // ignore cache write failures
  }

  return res.status(200).json(payload);
};

/* ============================================================
   SOLAR SYSTEM OPENDATA - Planet positions for tonight
   API: https://api.le-systeme-solaire.net/rest/positions
   Returns: planets[], moon, sun
   ============================================================ */
async function fetchSolarSystemPositions(lat, lon) {
  const token = process.env.SOLSYS_TOKEN;
  if (!token) {
    throw new Error('Missing SOLSYS_TOKEN');
  }

  // Tonight at evening reference time (21:00 local, approximated via lon offset)
  // The API expects datatime in YYYY-MM-DDTHH:MM format in UTC, with a separate zon offset
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const datatime = `${yyyy}-${mm}-${dd}T03:00`; // 03:00 UTC ~ evening US

  // Approximate timezone offset from longitude (15 degrees per hour)
  const tzOffset = Math.round(lon / 15);

  const url = new URL('https://api.le-systeme-solaire.net/rest/positions');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());
  url.searchParams.set('elev', '1');
  url.searchParams.set('datetime', datatime);
  url.searchParams.set('zone', tzOffset.toString());

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SolarSystem API returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();

  // Real shape (confirmed): { positions: [{name, ra, dec, az, alt}, ...], location: {...}, time_info: {...} }
  // Names come in French; we map them to English for display
  const bodies = Array.isArray(json.positions) ? json.positions : [];

  const planets = [];
  let moon = null;
  let sun = null;

  // French name -> English mapping
  const nameMap = {
    'soleil': 'Sun',
    'lune': 'Moon',
    'mercure': 'Mercury',
    'venus': 'Venus',
    'mars': 'Mars',
    'jupiter': 'Jupiter',
    'saturne': 'Saturn',
    'uranus': 'Uranus',
    'neptune': 'Neptune',
    'pluton': 'Pluto'
  };
  // Which French keys map to which payload bucket
  const bucketMap = {
    'soleil': 'sun',
    'lune': 'moon'
  };

  for (const body of bodies) {
    const frenchName = (body.name || '').toLowerCase();
    if (!nameMap[frenchName]) continue;

    const altDeg = parseDMS(body.alt);
    const azDeg = parseDMS(body.az);

    const item = {
      id: frenchName,
      name: nameMap[frenchName],
      altitude: Number.isFinite(altDeg) ? Math.round(altDeg * 10) / 10 : null,
      azimuth: Number.isFinite(azDeg) ? Math.round(azDeg * 10) / 10 : null,
      magnitude: null, // not provided by this API
      constellation: null, // not provided by this API
      aboveHorizon: Number.isFinite(altDeg) && altDeg > 0,
      rightAscension: body.ra || null,
      declination: body.dec || null
    };

    if (bucketMap[frenchName] === 'moon') {
      moon = item;
    } else if (bucketMap[frenchName] === 'sun') {
      sun = item;
    } else {
      planets.push(item);
    }
  }

  return { planets, moon, sun };
}

/* Parse DMS strings like "48°26'22\"" or "-23°02'08\"" into decimal degrees */
function parseDMS(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  // Match: optional minus, degrees, optional minutes, optional seconds
  // Example: -23°02'08"  or  303°38'30"
  const match = value.match(/(-?)\s*(\d+)\s*[°d]?\s*(\d+)?\s*['′m]?\s*([\d.]+)?/);
  if (!match) return null;

  const sign = match[1] === '-' ? -1 : 1;
  const d = parseFloat(match[2]) || 0;
  const m = parseFloat(match[3]) || 0;
  const s = parseFloat(match[4]) || 0;

  return sign * (d + m / 60 + s / 3600);
}

/* ============================================================
   NASA APOD - Astronomy Picture of the Day
   ============================================================ */
async function fetchAPOD() {
  const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';

  const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}`);

  if (!res.ok) {
    throw new Error(`NASA APOD returned ${res.status}`);
  }

  const data = await res.json();

  return {
    title: data.title || null,
    explanation: data.explanation || null,
    url: data.url || null,
    hdurl: data.hdurl || null,
    mediaType: data.media_type || null,
    copyright: data.copyright || null,
    date: data.date || null
  };
}

/* ============================================================
   NASA NeoWs - Near-Earth asteroids this week
   ============================================================ */
async function fetchNeoWs() {
  const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';

  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 7);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startStr}&end_date=${endStr}&api_key=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`NASA NeoWs returned ${res.status}`);
  }

  const data = await res.json();
  const byDate = data.near_earth_objects || {};
  const flat = [];

  for (const date in byDate) {
    for (const neo of byDate[date]) {
      const approach = neo.close_approach_data?.[0];
      if (!approach) continue;

      const dMin = parseFloat(neo.estimated_diameter?.meters?.estimated_diameter_min) || 0;
      const dMax = parseFloat(neo.estimated_diameter?.meters?.estimated_diameter_max) || 0;
      const diameterAvg = Math.round((dMin + dMax) / 2);

      flat.push({
        name: neo.name,
        diameterMeters: diameterAvg,
        missDistanceKm: Math.round(parseFloat(approach.miss_distance?.kilometers) || 0),
        missDistanceLunar: Math.round((parseFloat(approach.miss_distance?.lunar) || 0) * 10) / 10,
        velocityKmh: Math.round(parseFloat(approach.relative_velocity?.kilometers_per_hour) || 0),
        closeApproachDate: approach.close_approach_date_full || approach.close_approach_date,
        hazardous: !!neo.is_potentially_hazardous_asteroid,
        url: neo.nasa_jpl_url
      });
    }
  }

  flat.sort((a, b) => a.missDistanceKm - b.missDistanceKm);
  return flat.slice(0, 10);
}

/* ============================================================
   NASA DONKI - Space weather notifications (last 3 days)
   ============================================================ */
async function fetchDONKI() {
  const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 3);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const [flrRes, gstRes, cmeRes] = await Promise.allSettled([
    fetch(`https://api.nasa.gov/DONKI/FLR?startDate=${startStr}&endDate=${endStr}&api_key=${apiKey}`),
    fetch(`https://api.nasa.gov/DONKI/GST?startDate=${startStr}&endDate=${endStr}&api_key=${apiKey}`),
    fetch(`https://api.nasa.gov/DONKI/CME?startDate=${startStr}&endDate=${endStr}&api_key=${apiKey}`)
  ]);

  const events = [];

  if (flrRes.status === 'fulfilled' && flrRes.value.ok) {
    try {
      const flrs = await flrRes.value.json();
      if (Array.isArray(flrs)) {
        for (const f of flrs) {
          events.push({
            type: 'Solar Flare',
            class: f.classType || null,
            time: f.beginTime || f.peakTime || null,
            summary: f.classType
              ? `Class ${f.classType} solar flare from active region ${f.activeRegionNum || 'unknown'}`
              : 'Solar flare detected',
            link: f.link || null
          });
        }
      }
    } catch (e) { /* skip */ }
  }

  if (gstRes.status === 'fulfilled' && gstRes.value.ok) {
    try {
      const gsts = await gstRes.value.json();
      if (Array.isArray(gsts)) {
        for (const g of gsts) {
          const kp = g.allKpIndex?.[0]?.kpIndex || null;
          events.push({
            type: 'Geomagnetic Storm',
            class: kp ? `Kp ${kp}` : null,
            time: g.startTime || null,
            summary: kp
              ? `Geomagnetic storm in progress (Kp ${kp}) - aurora possible at lower latitudes`
              : 'Geomagnetic storm detected',
            link: g.link || null
          });
        }
      }
    } catch (e) { /* skip */ }
  }

  if (cmeRes.status === 'fulfilled' && cmeRes.value.ok) {
    try {
      const cmes = await cmeRes.value.json();
      if (Array.isArray(cmes)) {
        for (const c of cmes) {
          const speed = c.cmeAnalyses?.[0]?.speed || null;
          events.push({
            type: 'Coronal Mass Ejection',
            class: speed ? `${Math.round(speed)} km/s` : null,
            time: c.startTime || null,
            summary: speed
              ? `Coronal mass ejection traveling at ${Math.round(speed).toLocaleString()} km/s`
              : 'Coronal mass ejection observed',
            link: c.link || null
          });
        }
      }
    } catch (e) { /* skip */ }
  }

  events.sort((a, b) => {
    const tA = a.time ? new Date(a.time).getTime() : 0;
    const tB = b.time ? new Date(b.time).getTime() : 0;
    return tB - tA;
  });
  return events.slice(0, 8);
}
