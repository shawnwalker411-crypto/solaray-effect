// /api/sky.js
// Sola's Nightscape data aggregator
// Fans out to Solar System OpenData + NASA APOD + NeoWs + DONKI, caches for 1 hour
// Browser calls /api/sky?lat=32.8&lon=-97.1 and gets one combined JSON payload
//
// V2 ADDITION: ?action=satellites&lat=&lon= returns ISS/Hubble/Tiangong passes
// from N2YO. Cached separately, 1 hour TTL.

const fs = require('fs');
const path = require('path');

const CACHE_DIR = '/tmp';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/* ============================================================
   MAIN HANDLER
   ============================================================ */
module.exports = async function handler(req, res) {
  // Route by ?action= parameter; default = original aggregator behavior
  if (req.query.action === 'satellites') {
    return handleSatellites(req, res);
  }
  if (req.query.action === 'aurora') {
    return handleAurora(req, res);
  }

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

/* ============================================================
   V2 ADDITION: SATELLITE PASSES (N2YO)
   GET /api/sky?action=satellites&lat=X&lon=Y
   Returns visual passes for ISS, Hubble, Tiangong over the next 2 days.
   Cached 1 hour per location to stay under N2YO rate limit (100 visualpasses/hour).
   ============================================================ */

const N2YO_SATELLITES = [
  { id: 25544, name: 'ISS' },         // International Space Station
  { id: 20580, name: 'Hubble' },      // Hubble Space Telescope
  { id: 48274, name: 'Tiangong' }     // Chinese Space Station (CSS)
];

async function handleSatellites(req, res) {
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

  // Per-location cache
  const cacheKey = `sat_${lat.toFixed(1)}_${lon.toFixed(1)}`;
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
      // cache miss, proceed
    }
  }

  const apiKey = process.env.N2YO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Missing N2YO_API_KEY env var'
    });
  }

  // Fetch all 3 satellites in parallel
  const results = await Promise.allSettled(
    N2YO_SATELLITES.map(sat => fetchN2YOPasses(sat, lat, lon, apiKey))
  );

  const passes = [];
  const errors = {};

  results.forEach((result, idx) => {
    const satName = N2YO_SATELLITES[idx].name;
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      passes.push(...result.value);
    } else {
      errors[satName] = result.reason ? (result.reason.message || 'Failed') : 'Unknown error';
    }
  });

  // Sort all passes chronologically
  passes.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const payload = {
    success: true,
    location: { lat, lon },
    fetched_at: new Date().toISOString(),
    passes,
    errors: Object.keys(errors).length ? errors : null
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
}

/* Fetch visual passes for a single satellite from N2YO.
   Endpoint: /visualpasses/{id}/{lat}/{lon}/{alt}/{days}/{min_visibility}
   Returns array of normalized pass objects, or throws on error. */
async function fetchN2YOPasses(sat, lat, lon, apiKey) {
  // 2 days lookahead, minimum 60 seconds visible
  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${sat.id}/${lat}/${lon}/0/2/60/&apiKey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`N2YO returned ${response.status} for ${sat.name}`);
  }

  const data = await response.json();

  // N2YO returns { error: "..." } on bad key, rate limit, etc.
  // It returns { info: {...}, passes: [...] } on success (passes may be empty).
  if (data.error) {
    throw new Error(`N2YO error for ${sat.name}: ${data.error}`);
  }

  const rawPasses = Array.isArray(data.passes) ? data.passes : [];

  // Normalize to our standard shape
  return rawPasses.map(p => ({
    name: sat.name,
    satid: sat.id,
    start: new Date(p.startUTC * 1000).toISOString(),
    startCompass: p.startAzCompass || null,
    end: new Date(p.endUTC * 1000).toISOString(),
    endCompass: p.endAzCompass || null,
    maxElevation: typeof p.maxEl === 'number' ? Math.round(p.maxEl) : null,
    duration: typeof p.duration === 'number' ? p.duration : null,
    magnitude: typeof p.mag === 'number' ? p.mag : null,
    direction: (p.startAzCompass && p.endAzCompass)
      ? `${p.startAzCompass} to ${p.endAzCompass}`
      : null
  }));
}

/* ============================================================
   V2 ADDITION: AURORA FORECAST (NOAA SWPC)
   GET /api/sky?action=aurora&lat=X
   Returns current Kp index, peak Kp in next 24 hours, and aurora
   visibility assessment based on user's latitude.
   No API key needed. Cached 1 hour globally (data is location-agnostic
   in fetch; visibility is computed per-request from cached Kp data).
   ============================================================ */

async function handleAurora(req, res) {
  const lat = parseFloat(req.query.lat);
  if (!Number.isFinite(lat)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid lat query parameter'
    });
  }
  if (lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      error: 'lat out of range'
    });
  }

  // Global cache key (Kp data is the same for everyone, only visibility calc is per-lat)
  const cacheFile = path.join(CACHE_DIR, 'aurora_kp.json');
  let kpEntries = null;

  if (req.query.refresh !== '1') {
    try {
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          kpEntries = cached.entries;
        }
      }
    } catch (e) {
      // cache miss, proceed
    }
  }

  if (!kpEntries) {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
      if (!response.ok) throw new Error(`NOAA SWPC returned ${response.status}`);
      const raw = await response.json();
      if (!Array.isArray(raw)) throw new Error('NOAA SWPC returned non-array');

      // Normalize
      kpEntries = raw.map(r => ({
        time: r.time_tag,
        kp: typeof r.kp === 'number' ? r.kp : parseFloat(r.kp),
        observed: r.observed || null,        // 'observed' | 'estimated' | 'predicted'
        noaaScale: r.noaa_scale || null      // null | 'G1' | 'G2' | ... 'G5'
      })).filter(e => Number.isFinite(e.kp));

      try {
        fs.writeFileSync(cacheFile, JSON.stringify({
          timestamp: Date.now(),
          entries: kpEntries
        }));
      } catch (e) {
        // ignore cache write failures
      }
    } catch (err) {
      return res.status(200).json({
        success: false,
        error: err.message || 'Failed to fetch NOAA SWPC data'
      });
    }
  }

  // Find current Kp (most recent observed/estimated entry)
  const now = Date.now();
  const past = kpEntries.filter(e => new Date(e.time).getTime() <= now);
  const current = past.length ? past[past.length - 1] : null;

  // Find peak Kp in next 24 hours (predicted entries)
  const next24Cutoff = now + 24 * 60 * 60 * 1000;
  const next24 = kpEntries.filter(e => {
    const t = new Date(e.time).getTime();
    return t > now && t <= next24Cutoff;
  });
  const peak = next24.reduce((max, e) => (!max || e.kp > max.kp ? e : max), null);

  // Find any active or upcoming storm (NOAA G-scale)
  const stormWindow = kpEntries.filter(e => {
    const t = new Date(e.time).getTime();
    return t >= now - 6 * 60 * 60 * 1000 && t <= next24Cutoff && e.noaaScale;
  });

  // Compute aurora visibility for user's latitude based on Kp.
  // Reference: aurora southern boundary moves equatorward as Kp rises.
  // Approximate magnetic latitude thresholds (geomagnetic, not geographic):
  //   Kp 0 -> 67N, Kp 3 -> 60N, Kp 5 -> 55N, Kp 6 -> 51N, Kp 7 -> 47N, Kp 8 -> 43N, Kp 9 -> 39N
  // Using geographic lat as a rough proxy; accurate enough for "yes/no/maybe" guidance.
  const peakKp = peak ? peak.kp : (current ? current.kp : 0);
  const auroraSouthernBoundary = kpToSouthernLatitude(peakKp);
  const userAbsLat = Math.abs(lat);
  const visibilityMargin = userAbsLat - auroraSouthernBoundary;

  let visibility, summary;
  if (visibilityMargin >= 5) {
    visibility = 'likely';
    summary = `At Kp ${peakKp.toFixed(1)}, aurora should be visible from your latitude (${lat.toFixed(1)}°). Look toward the pole-facing horizon.`;
  } else if (visibilityMargin >= 0) {
    visibility = 'possible';
    summary = `At Kp ${peakKp.toFixed(1)}, aurora might be visible low on the pole-facing horizon from your latitude (${lat.toFixed(1)}°). Get to a dark site away from city lights.`;
  } else if (visibilityMargin >= -8) {
    visibility = 'edge';
    summary = `At Kp ${peakKp.toFixed(1)}, aurora is right at the edge of visibility from your latitude (${lat.toFixed(1)}°). A stronger spike could push it into your sky &mdash; watch for updates.`;
  } else {
    visibility = 'unlikely';
    summary = `At Kp ${peakKp.toFixed(1)}, aurora is unlikely from your latitude (${lat.toFixed(1)}°). Would need a strong geomagnetic storm (Kp 6+) to reach you.`;
  }

  const payload = {
    success: true,
    location: { lat },
    fetched_at: new Date().toISOString(),
    current: current ? {
      time: current.time,
      kp: current.kp,
      observed: current.observed,
      noaaScale: current.noaaScale
    } : null,
    peak24h: peak ? {
      time: peak.time,
      kp: peak.kp,
      noaaScale: peak.noaaScale
    } : null,
    activeStorms: stormWindow.map(s => ({
      time: s.time,
      kp: s.kp,
      scale: s.noaaScale
    })),
    visibility,           // 'likely' | 'possible' | 'edge' | 'unlikely'
    summary,
    auroraSouthernBoundary
  };

  return res.status(200).json(payload);
}

/* Kp index to approximate southern visible latitude (degrees North).
   Source: NOAA SWPC Aurora Tutorial.
   This is the geographic latitude (rough proxy for magnetic) at which
   aurora becomes visible on the northern horizon under dark, clear skies. */
function kpToSouthernLatitude(kp) {
  if (kp <= 0) return 67;
  if (kp <= 1) return 66;
  if (kp <= 2) return 64;
  if (kp <= 3) return 62;
  if (kp <= 4) return 58;
  if (kp <= 5) return 55;
  if (kp <= 6) return 51;
  if (kp <= 7) return 47;
  if (kp <= 8) return 43;
  return 39;
}
