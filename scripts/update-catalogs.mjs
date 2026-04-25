// scripts/update-catalogs.mjs
// Monthly catalog refresh job. Triggered by GitHub Action
// (.github/workflows/monthly-catalog-update.yml) on the 1st of each month.
//
// Currently fetches MinerStat hardware data and writes data/minerstat-hardware.json.
// The action then commits any changes back to the repo.
//
// Pools data is intentionally not fetched here -- pools.json stays curated by hand.

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data");
const HARDWARE_FILE = path.join(OUT_DIR, "minerstat-hardware.json");

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

// fetch with timeout + one retry. Throws on final failure.
async function fetchWithRetry(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`Attempt ${attempt + 1} failed: ${err.message}. Retrying...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastError;
}

async function updateMinerstatHardware() {
  const key = mustEnv("MINERSTAT_API_KEY");

  // X-API-Key header is the production method per MinerStat docs.
  // Query-string ?key= is documented as "for browser tests, not production".
  const raw = await fetchWithRetry("https://api.minerstat.com/v2/hardware", {
    "X-API-Key": key
  });

  // Defensive: confirm response is non-empty before writing.
  // Hardware catalog has hundreds of entries; an empty array means MinerStat
  // returned a structural success but no data, which would silently wipe the file.
  const entryCount = Array.isArray(raw) ? raw.length : Object.keys(raw).length;
  if (entryCount === 0) {
    throw new Error("MinerStat returned 0 hardware entries -- aborting to avoid wiping the catalog.");
  }

  const payload = {
    fetched_at: new Date().toISOString(),
    source: "minerstat/v2/hardware",
    note: "Free tier may be incomplete. Supplemental use only -- the manually curated catalog in miners.html is primary.",
    entry_count: entryCount,
    data: raw
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(HARDWARE_FILE, JSON.stringify(payload, null, 2));
  console.log(`MinerStat hardware entries: ${entryCount}`);
}

async function main() {
  await updateMinerstatHardware();
}

main().catch((e) => {
  console.error("update-catalogs failed:", e.message);
  process.exit(1);
});
