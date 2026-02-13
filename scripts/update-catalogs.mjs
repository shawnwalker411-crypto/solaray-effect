// scripts/update-catalogs.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function updateMinerstatHardware() {
  const key = mustEnv("MINERSTAT_API_KEY");
  const url = `https://api.minerstat.com/v2/hardware?key=${key}`;
  const raw = await fetchJson(url);

  const payload = {
    fetched_at: new Date().toISOString(),
    source: "minerstat/v2/hardware",
    note: "May be incomplete depending on MinerStat plan.",
    entry_count: Array.isArray(raw) ? raw.length : Object.keys(raw).length,
    data: raw
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "minerstat-hardware.json"), JSON.stringify(payload, null, 2));
  console.log(`MinerStat hardware entries: ${payload.entry_count}`);
}

async function updatePools() {
  // IMPORTANT:
  // Replace this with your real pools source(s).
  // If you already have a curated pools list in the repo, you can skip external fetching
  // and just keep it as a maintained JSON file.
  //
  // Example placeholder:
  const payload = {
    fetched_at: new Date().toISOString(),
    source: "curated",
    pools: []
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "pools.json"), JSON.stringify(payload, null, 2));
  console.log("Pools updated (placeholder).");
}

async function main() {
  await updateMinerstatHardware();
  await updatePools();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
