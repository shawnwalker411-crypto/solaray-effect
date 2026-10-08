// SolaRayEffect generator: turns the master lists into files the pages read.
// Runs at deploy right after build/check.mjs (see vercel.json -> buildCommand).
// Output is written fresh on every deploy - never edit data/generated/ by hand.
// If anything here fails, the deploy fails and the live site stays as it was.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'generated');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const load = (n) => parseCSV(readFileSync(join(ROOT, 'data', 'master', n), 'utf8'));
const fail = (m) => { console.error('GENERATE FAILED: ' + m); process.exit(1); };

const miners = load('miners.csv');
const coins = load('coins.csv');
const shownCoins = new Set(coins.filter((c) => ['keep', 'add', 'info'].includes(c.status)).map((c) => c.symbol));

// The calculator multiplies hashrate by a per-unit revenue rate, so every
// miner must be expressed in the unit its algorithm's rate uses.
const CALC_UNIT = {
  'SHA-256': 'TH/s', 'Scrypt': 'MH/s', 'KHeavyHash': 'GH/s', 'Etchash': 'MH/s',
  'Equihash': 'kSol/s', 'X11': 'GH/s', 'Blake3': 'GH/s',
};
const TO_H = { 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12, 'kSol/s': 1, };
const NOISE = {
  'Silent (0-30 dB)': 'silent', 'Fan (30-50 dB)': 'fan',
  'Loud (50-70 dB)': 'vacuum', 'Very Loud (75+ dB)': 'lawnmower',
};
const ALGO_ORDER = ['SHA-256', 'Scrypt', 'KHeavyHash', 'Etchash', 'Equihash', 'X11', 'Blake3'];

const out = [];
const removed = {};
for (const m of miners) {
  if (m.status === 'remove' || m.status === 'merge') { removed[m.id] = m.name; continue; }
  if (!['keep', 'add'].includes(m.status)) continue;

  const algo = m.algorithm;
  const unit = CALC_UNIT[algo];
  if (!unit) fail(`${m.id}: algorithm ${algo} has no calculator unit`);
  let hr = Number(m.hashrate);
  if (m.unit !== unit) {
    if (algo === 'Equihash' || !(m.unit in TO_H) || !(unit in TO_H)) fail(`${m.id}: cannot convert ${m.unit} to ${unit}`);
    hr = (hr * TO_H[m.unit]) / TO_H[unit];
  }
  hr = Number(hr.toPrecision(10));
  const noise = NOISE[m.noise];
  if (!noise) fail(`${m.id}: noise "${m.noise}" is not one of: ${Object.keys(NOISE).join(', ')}`);
  if (!['Room Temp', 'Needs Ventilation'].includes(m.cooling_note)) fail(`${m.id}: cooling_note "${m.cooling_note}" must be Room Temp or Needs Ventilation`);

  out.push({
    id: m.id,
    name: m.name,
    manufacturer: m.manufacturer,
    hashrate: hr,
    unit,
    power: Number(m.power_w),
    algorithm: algo,
    coins: m.coins.split(';').map((s) => s.trim()).filter((s) => shownCoins.has(s)).map((s) => s.replace(/-(SHA|SCRYPT)$/, '')),
    category: m.lottery === 'yes' ? 'lottery' : null,
    voltage: m.voltage,
    noise,
    noiseLabel: m.noise,
    cooling: m.cooling_note,
    loki: /loki|bypass/i.test(m.build),
  });
}
for (const o of out) o.coins = [...new Set(o.coins)];

out.sort((a, b) =>
  (a.voltage === b.voltage ? 0 : a.voltage === '120V' ? -1 : 1) ||
  ((a.category === 'lottery' ? 0 : 1) - (b.category === 'lottery' ? 0 : 1)) ||
  (ALGO_ORDER.indexOf(a.algorithm) - ALGO_ORDER.indexOf(b.algorithm)) ||
  a.name.localeCompare(b.name, 'en', { numeric: true }));

if (out.length < 50) fail(`only ${out.length} miners - refusing to publish a short list`);

const js = `// GENERATED at deploy from data/master/miners.csv by build/generate.mjs - do not edit.
window.SRE_MINERS = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{')};
window.SRE_RETIRED_MINERS = ${JSON.stringify(removed)};
`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'miners.js'), js);
console.log(`generated data/generated/miners.js: ${out.length} miners (${out.filter((m) => m.voltage === '120V').length} on 120V), ${Object.keys(removed).length} retired IDs`);
