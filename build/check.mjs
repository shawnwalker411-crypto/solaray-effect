// SolaRayEffect build safety check.
// Runs on every Vercel deploy (vercel.json -> buildCommand).
// If any BLOCK rule fails, the build fails and the current live site stays up.
// REPORT rules only print warnings (they become BLOCK as later steps clean the pages).
// No dependencies: plain Node.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'data', 'master');
const EBAY_CAMPID = '5339142622';
const GA_ID = 'G-M6F5T8Y2P6';
// Pages already rebuilt from the master lists (add each page as its step finishes).
const LOCKED_PAGES = ['index.html', 'miners.html', 'pools.html'];
const CSP_REQUIRED = ['https://www.googletagmanager.com', 'https://*.google-analytics.com'];

const blocks = [];
const reports = [];
const block = (m) => blocks.push(m);
const report = (m) => reports.push(m);

// ---------- CSV ----------
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
  return rows.map((r, n) => {
    if (r.length !== head.length) block(`CSV row ${n + 2} has ${r.length} columns, header has ${head.length}`);
    return Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]));
  });
}
function load(name) {
  const p = join(MASTER, name);
  if (!existsSync(p)) { block(`missing master list ${name}`); return []; }
  return parseCSV(readFileSync(p, 'utf8'));
}

const miners = load('miners.csv');
const coins = load('coins.csv');
const pools = load('pools.csv');
const products = load('products.csv');
const poolSections = load('pool_sections.csv');

const live = (r) => ['keep', 'add', 'verify'].includes(r.status);

// ---------- Coins ----------
const COIN_STATUS = ['keep', 'add', 'info', 'watch', 'remove']; // info = shown on miner cards only; watch = kept on file, not shown anywhere
const coinSet = new Set();
for (const c of coins) {
  const id = `coin ${c.symbol || '(blank)'}`;
  for (const f of ['symbol', 'name', 'algorithm', 'price_feed_id', 'status'])
    if (!c[f]) block(`${id}: missing ${f}`);
  if (!COIN_STATUS.includes(c.status)) block(`${id}: unknown status "${c.status}"`);
  if (coinSet.has(c.symbol)) block(`${id}: duplicate symbol`);
  coinSet.add(c.symbol);
}
const liveCoins = new Set(coins.filter((c) => live(c) || c.status === 'info').map((c) => c.symbol));

// ---------- Miners ----------
// Unit multipliers to a base unit per algorithm, and allowed efficiency (W per base unit).
const UNIT = { 'kH/s': 1e-3, 'MH/s': 1, 'GH/s': 1e3, 'TH/s': 1e6, 'kSol/s': 1 };
const EFF = {
  // algorithm family: [base unit label, base unit in MH/s or kSol/s, min, max] (J per base unit)
  'SHA-256': ['TH', 1e6, 10, 40],
  'Scrypt': ['MH', 1, 0.15, 2.0],
  'KHeavyHash': ['GH', 1e3, 0.05, 1.0],
  'Blake3': ['GH', 1e3, 0.2, 2.5],
  'Equihash': ['kSol', 1, 2, 40],
  'Etchash': ['MH', 1, 0.1, 1.5],
  'X11': ['GH', 1e3, 1, 4],
  'SHA512256d': ['TH', 1e6, 10, 40],
};
const family = (a) => a.replace(/-(FB|XEC|QUAI)$/, '');
const MINER_STATUS = ['keep', 'add', 'verify', 'remove', 'merge'];
const minerIds = new Set();
for (const m of miners) {
  const id = `miner ${m.id || '(blank id)'}`;
  if (!m.id) block(`${id}: missing id`);
  if (minerIds.has(m.id)) block(`${id}: duplicate id`);
  minerIds.add(m.id);
  if (!MINER_STATUS.includes(m.status)) block(`${id}: unknown status "${m.status}"`);
  if (!live(m)) continue;

  for (const f of ['name', 'manufacturer', 'algorithm', 'hashrate', 'unit', 'power_w', 'voltage', 'coins', 'source_url', 'last_verified'])
    if (!m[f]) block(`${id}: missing ${f}`);
  if (!['120V', '240V'].includes(m.voltage)) block(`${id}: voltage must be 120V or 240V (got "${m.voltage}")`);
  if (m.phase !== 'single') block(`${id}: must be single-phase (no 3-phase commercial miners)`);
  if (m.cooling !== 'air') block(`${id}: must be air-cooled (no immersion or hydro rigs)`);
  if (!/^https?:\/\//.test(m.source_url)) block(`${id}: source_url must be a link`);

  const hr = Number(m.hashrate), w = Number(m.power_w);
  if (!(hr > 0)) block(`${id}: hashrate "${m.hashrate}" is not a positive number`);
  if (!(w > 0)) block(`${id}: power_w "${m.power_w}" is not a positive number`);
  if (!(m.unit in UNIT)) block(`${id}: unknown unit "${m.unit}"`);
  const fam = family(m.algorithm);
  const e = EFF[fam];
  if (!e) block(`${id}: unknown algorithm "${m.algorithm}"`);
  else if (m.lottery !== 'yes' && hr > 0 && w > 0 && m.unit in UNIT) {
    const base = (hr * UNIT[m.unit]) / e[1];
    const jpu = w / base;
    if (jpu < e[2] || jpu > e[3])
      block(`${id}: efficiency ${jpu.toFixed(3)} J/${e[0]} is outside the believable range ${e[2]}-${e[3]} for ${fam} (check hashrate/unit/power)`);
  }
  if (m.voltage === '120V' && w > 1500 && !/loki|bypass/i.test(m.build))
    block(`${id}: ${w} W on 120V needs a Loki/PSU-bypass build label`);

  for (const sym of m.coins.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!coinSet.has(sym)) block(`${id}: coin "${sym}" is not in coins.csv`);
    else if (!liveCoins.has(sym)) block(`${id}: coin "${sym}" is marked removed`);
    else {
      const ca = coins.find((c) => c.symbol === sym).algorithm.toLowerCase();
      if (fam && ca !== fam.toLowerCase()) block(`${id}: coin ${sym} uses ${ca}, but this miner is ${fam}`);
    }
  }
  if (fam === 'Etchash') {
    if (!(Number(m.memory_gb) > 0)) block(`${id}: Etchash miner needs memory_gb (ETC DAG check)`);
    else if (Number(m.memory_gb) < 4.5) block(`${id}: ${m.memory_gb} GB is too small for the current ETC DAG (~4.4 GB)`);
  }
}
for (const m of miners.filter((x) => x.status === 'merge'))
  if (!m.equivalent && !m.notes) report(`miner ${m.id}: merge row has no note saying which miner it merges into`);

// ---------- Pools ----------
const POOL_STATUS = ['keep', 'add', 'verify', 'watch', 'remove'];
const sectionSym = (s) => (s.match(/\(([A-Z0-9]+)\)/) || [])[1];
for (const p of pools) {
  const id = `pool ${p.pool || '(blank)'} [${p.coin_section}]`;
  if (!POOL_STATUS.includes(p.status)) block(`${id}: unknown status "${p.status}"`);
  if (!live(p)) continue;
  for (const f of ['coin_section', 'pool', 'url', 'fee']) if (!p[f]) block(`${id}: missing ${f}`);
  if (p.url && !/^https:\/\//.test(p.url)) block(`${id}: url must start with https://`);
  const sym = sectionSym(p.coin_section);
  const known = (set) => sym && [...set].some((s) => s === sym || s.startsWith(sym + '-'));
  if (sym && !known(coinSet)) block(`${id}: coin ${sym} is not in coins.csv`);
  else if (sym && !known(liveCoins)) block(`${id}: coin ${sym} is removed but pool is still listed`);
  if (p.status === 'verify') report(`${id}: payout/minimum still to verify on the pool site`);
}

// ---------- Pool page sections ----------
const liveSections = new Set();
const seenSections = new Set();
for (const p of poolSections) {
  const id = `pool section "${p.section || '(blank)'}"`;
  if (!['keep', 'add', 'watch', 'remove'].includes(p.status)) block(`${id}: unknown status "${p.status}"`);
  if (seenSections.has(p.section)) block(`${id}: duplicate section`);
  seenSections.add(p.section);
  if (!live(p)) continue;
  liveSections.add(p.section);
  for (const f of ['section', 'data_coin', 'icon', 'tag', 'tag_class', 'note', 'order']) if (!p[f]) block(`${id}: missing ${f}`);
  for (const link of p.shop_links.split(';').filter(Boolean)) {
    const [label, term, cid] = link.split('|');
    if (!label || !term || !cid) block(`${id}: shop link "${link}" must be label|search|customid`);
  }
}
for (const p of pools) if (live(p) && !liveSections.has(p.coin_section)) block(`pool ${p.pool} [${p.coin_section}]: no live section for it in pool_sections.csv`);

// ---------- Settings + products (shop rails) ----------
const settings = Object.fromEntries(load('settings.csv').map((r) => [r.setting, r.value]));
for (const k of ['amazon_tag', 'ebay_campid', 'rail_pages', 'rail_min_items']) if (!settings[k]) block(`settings.csv: missing ${k}`);
if (settings.ebay_campid && settings.ebay_campid !== EBAY_CAMPID) block(`settings.csv: ebay_campid ${settings.ebay_campid} does not match ${EBAY_CAMPID}`);
const railPages = (settings.rail_pages || '').split(/\s+/).filter(Boolean);
for (const pg of ['night_sky', 'solar_forecast']) if (railPages.includes(pg)) block(`settings.csv: no shop rails allowed on ${pg}`);
for (const p of products) {
  const id = `product "${p.product}"`;
  if (!['keep', 'add', 'remove'].includes(p.status)) block(`${id}: unknown status "${p.status}"`);
  if (!live(p)) continue;
  for (const f of ['product', 'short_name', 'store', 'search_term', 'icon_left', 'icon_right', 'pages', 'order']) if (!p[f]) block(`${id}: missing ${f}`);
  if (!['ebay', 'amazon'].includes(p.store)) block(`${id}: store must be ebay or amazon`);
  if (p.store === 'ebay' && !p.customid) block(`${id}: eBay item needs a customid (click label)`);
  if (/immersion|hydro/i.test(p.product + p.search_term)) block(`${id}: immersion/hydro products are not allowed`);
  for (const pg of p.pages.split(/\s+/).filter(Boolean)) if (!railPages.includes(pg)) block(`${id}: page "${pg}" is not in settings rail_pages`);
  for (const ic of [p.icon_left, p.icon_right]) if (ic.startsWith('img:') && !existsSync(join(ROOT, 'assets', 'rail', ic.slice(4) + '.png'))) block(`${id}: icon file assets/rail/${ic.slice(4)}.png is missing`);
}

// ---------- Pages ----------
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const SITE_CSP = ((vercel.headers || []).find((h) => h.source === '/(.*)') || { headers: [] }).headers
  .filter((h) => h.key === 'Content-Security-Policy').map((h) => h.value)[0] || '';
if (!SITE_CSP) block('vercel.json: missing the site-wide Content-Security-Policy header');
for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-src 'none'"]) if (SITE_CSP && !SITE_CSP.includes(d)) block(`vercel.json: security policy lost "${d}"`);
const comps = existsSync(join(ROOT, 'Components'))
  ? readdirSync(join(ROOT, 'Components')).filter((f) => f.endsWith('.html')).map((f) => 'Components/' + f) : [];
const EMOJI = /\p{Extended_Pictographic}/u;
const MOJIBAKE = /(Ã.|â€|ðŸ|ï»¿|�)/;

// Names of removed miners and coins, for the content scan.
const removedMinerNames = miners.filter((m) => m.status === 'remove').map((m) => m.name);
const keptMinerNames = miners.filter((m) => live(m)).map((m) => m.name).sort((x, y) => y.length - x.length);
const removedCoins = coins.filter((c) => c.status === 'remove');

for (const f of [...pages, ...comps]) {
  const html = readFileSync(join(ROOT, f), 'utf8');
  const lines = html.split('\n');

  // Every site script the page loads must exist (a missing one breaks the page).
  const localScripts = [...html.matchAll(/<script[^>]*\ssrc="\/([^"?#]+)"/g)].map((m) => m[1]);
  for (const s of localScripts) if (!existsSync(join(ROOT, s))) block(`${f}: loads /${s}, which does not exist`);

  // eBay affiliate tag on every eBay link
  for (const [i, l] of lines.entries()) {
    for (const href of l.match(/https?:\/\/(?:www\.)?ebay\.com[^"'\s<>]*/g) || []) {
      if (!href.includes('campid=' + EBAY_CAMPID)) block(`${f}:${i + 1}: eBay link without campid=${EBAY_CAMPID}: ${href.slice(0, 90)}`);
    }
    if (MOJIBAKE.test(l)) block(`${f}:${i + 1}: garbled characters (encoding damage)`);
    for (const href of l.match(/https?:\/\/(?:www\.)?amazon\.com[^"'\s<>]*/g) || []) {
      if (settings.amazon_tag && !href.includes('tag=' + settings.amazon_tag)) block(`${f}:${i + 1}: Amazon link without tag=${settings.amazon_tag}: ${href.slice(0, 90)}`);
    }
  }

  if (f.startsWith('Components/')) continue;

  // Shop rails: built on every page in settings rail_pages, nowhere else.
  const pageName = f.replace(/\.html$/, '');
  const railCount = (html.match(/<aside class="affiliate-rail(-right)?"/g) || []).length;
  // Count only the mining shop strips (night_sky has its own astronomy gear strip).
  const stripCount = (html.match(/<div class="strip-title">Shop (Miners|Gear) &#x2022; (eBay|Amazon)<\/div>/g) || []).length;
  if (railPages.includes(pageName)) {
    if (railCount !== 2) block(`${f}: should have 2 shop rails, found ${railCount} (did the generator run?)`);
    if (stripCount !== 2) block(`${f}: should have 2 phone shop strips, found ${stripCount}`);
  } else if (railCount || stripCount || html.includes('<!-- SHOP-RAILS:START -->')) block(`${f}: has mining shop rails/strips but is not in settings rail_pages`);

  // The pools page must hold exactly one table row per live pool (built by generate.mjs).
  if (f === 'pools.html') {
    const rows = (html.match(/<a class="pool-link" /g) || []).length;
    const livePools = pools.filter((p) => ['keep', 'add'].includes(p.status)).length;
    if (rows !== livePools) block(`pools.html: ${rows} pool rows but the master list has ${livePools} live pools (did the generator run?)`);
  }
  // The catalog must hold exactly one card per live miner (built by generate.mjs).
  if (f === 'miners.html') {
    const cards = (html.match(/<div class="miner-card" /g) || []).length;
    const liveMiners = miners.filter(live).length;
    if (cards !== liveMiners) block(`miners.html: ${cards} miner cards but the master list has ${liveMiners} live miners (did the generator run?)`);
  }

  // Analytics + security policy
  // One security policy for the whole site lives in vercel.json (headers).
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) block(`${f}: has its own security policy meta tag; the site-wide one in vercel.json is the only policy`);
  const csp = SITE_CSP;
  const hasGA = html.includes('<script src="/assets/analytics.js"></script>');
  if (!hasGA) block(`${f}: missing the shared Analytics file /assets/analytics.js`);
  if (hasGA && csp) {
    const miss = CSP_REQUIRED.filter((d) => !csp.includes(d));
    if (miss.length) block(`${f}: security policy is missing ${miss.join(' + ')} (Analytics hits may be blocked)`);
  }

  // Raw emoji in page text: write them as HTML codes (&#x26A1;) so they display the same everywhere
  for (const [i, l] of lines.entries()) if (EMOJI.test(l)) block(`${f}:${i + 1}: raw emoji (write it as an HTML code like &#x26A1;)`);

  // Content consistency scan. Pages in LOCKED_PAGES have been rebuilt from the
  // master lists, so any removed miner or coin on them (text OR code) blocks
  // the deploy. Other pages only warn until their step converts them.
  const locked = LOCKED_PAGES.includes(f);
  const flag = locked ? block : report;
  // Locked pages: also scan the site scripts they load (e.g. /assets/calculator.js).
  const scriptText = locked ? localScripts.filter((s) => !s.startsWith('data/generated/') && existsSync(join(ROOT, s))).map((s) => readFileSync(join(ROOT, s), 'utf8')).join('\n') : '';
  let text = locked ? html + '\n' + scriptText : html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  // Blank out kept miner names first (longest first) so a removed name that is
  // the start of a kept one (Mini-DOGE vs Mini-DOGE III) is not a false alarm.
  for (const n of keptMinerNames) text = text.split(n).join(' ');
  for (const n of removedMinerNames) if (new RegExp(`(^|[^\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w+-])`).test(text)) flag(`${f}: mentions removed miner "${n}"`);
  for (const c of removedCoins) {
    if (new RegExp(`\\b${c.name}\\b`).test(text)) flag(`${f}: mentions removed coin ${c.name} (${c.symbol})`);
    if (locked && new RegExp(`['"\\s>(]${c.symbol}['"\\s<),:]`).test(text)) flag(`${f}: uses removed coin symbol ${c.symbol}`);
  }
}

// ---------- Output ----------
const cnt = (a, s) => a.filter((r) => live(r)).length + ` live / ${a.length} rows` + (s ? ` ${s}` : '');
console.log('SolaRayEffect build check');
console.log(`  miners:   ${cnt(miners)}`);
console.log(`  coins:    ${cnt(coins)}`);
console.log(`  pools:    ${cnt(pools)}`);
console.log(`  products: ${cnt(products)}`);
console.log(`  pages:    ${pages.length} + ${comps.length} components`);
if (reports.length) {
  console.log(`\nWARNINGS (do not stop the deploy) - ${reports.length}:`);
  for (const r of reports) console.log('  - ' + r);
}
if (blocks.length) {
  console.log(`\nBLOCKED - ${blocks.length} problem(s). The live site was NOT changed:`);
  for (const b of blocks) console.log('  x ' + b);
  process.exit(1);
}
console.log('\nPASSED - safe to deploy.');
