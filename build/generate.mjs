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

// =====================================================================
// CATALOG (miners.html): cards are written between the CATALOG markers.
// The copy in GitHub holds only the markers; the deployed page gets the
// full static HTML (good for Google). Runs only if the markers exist.
// =====================================================================
import { existsSync } from 'node:fs';
const CATALOG_AMAZON_TAG = Object.fromEntries(load('settings.csv').map((r) => [r.setting, r.value])).amazon_tag || fail('settings.csv needs amazon_tag');
const CATALOG = join(ROOT, 'miners.html');
const START = '<!-- CATALOG:START (generated at deploy from data/master/miners.csv - do not edit) -->';
const END = '<!-- CATALOG:END -->';
const LD_START = '<!-- CATALOG-LD:START -->';
const LD_END = '<!-- CATALOG-LD:END -->';

// HTML-escape and turn every non-ASCII character (emoji, dashes) into a numeric code.
const enc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[^\x00-\x7F]/gu, (ch) => '&#x' + ch.codePointAt(0).toString(16).toUpperCase() + ';');
const plus = (s) => encodeURIComponent(s.trim()).replace(/%20/g, '+');

const SECTIONS = [
  { algo: 'SHA-256', icon: '&#x20BF;', primary: ['BTC'], label: 'Bitcoin (BTC)', ld: 'SHA-256 Bitcoin' },
  { algo: 'Scrypt', icon: '&#x1F415;', primary: ['LTC', 'DOGE'], label: 'Litecoin (LTC) + Dogecoin (DOGE)', ld: 'Scrypt Litecoin/Dogecoin' },
  { algo: 'KHeavyHash', icon: '&#x1F48E;', primary: ['KAS'], label: 'Kaspa (KAS)', ld: 'KHeavyHash Kaspa' },
  { algo: 'Etchash', icon: '&#x27E0;', primary: ['ETC'], label: 'Ethereum Classic (ETC)', ld: 'Etchash Ethereum Classic' },
  { algo: 'Equihash', icon: '&#x1F6E1;', primary: ['ZEC'], label: 'Zcash (ZEC)', ld: 'Equihash Zcash' },
  { algo: 'X11', icon: '&#x26A1;', primary: ['DASH'], label: 'Dash (DASH)', ld: 'X11 Dash' },
  { algo: 'Blake3', icon: '&#x1F48E;', primary: ['ALPH'], label: 'Alephium (ALPH)', ld: 'Blake3 Alephium' },
];
const short = (sym) => sym.replace(/-(SHA|SCRYPT)$/, '');
const fmtNum = (n) => String(Number(Number(n).toPrecision(6)));

const catalogMiners = miners.filter((m) => ['keep', 'add'].includes(m.status));
const groupRank = (m) => (m.lottery === 'yes' ? 0 : m.voltage === '120V' && !/loki|bypass/i.test(m.build) ? 1 : m.voltage === '120V' ? 2 : 3);
const hashBase = (m) => Number(m.hashrate) * (TO_H[m.unit] || 1);

function card(m) {
  const isLoki = /loki|bypass/i.test(m.build);
  const lottery = m.lottery === 'yes';
  const coins = [...new Set(m.coins.split(';').map((s) => s.trim()).filter((s) => shownCoins.has(s)).map(short))];
  const sec = SECTIONS.find((s) => s.algo === m.algorithm);
  const prim = coins.filter((c) => sec.primary.includes(c));
  const also = coins.filter((c) => !sec.primary.includes(c));
  const badge = lottery ? '<span class="voltage-badge lottery">Lottery</span>'
    : isLoki ? '<span class="voltage-badge loki"><a href="aftermarket_firmware.html#psu-bypass" style="color:inherit;text-decoration:none;">120V Conv.</a></span>'
    : m.voltage === '120V' ? '<span class="voltage-badge v120">120V</span>' : '<span class="voltage-badge v240">240V</span>';
  const search = [m.name, m.manufacturer, ...coins, isLoki ? '120v psu bypass loki' : ''].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  const kwh = (Number(m.power_w) * 24 / 1000).toFixed(1);
  const noiseWord = m.noise.replace(/\s*\(.*$/, '');
  const cid = m.ebay_customid || 'miners_' + m.id.replace(/-/g, '_'); // custom label keeps old eBay click history
  const ebay = `https://www.ebay.com/sch/i.html?_nkw=${plus(m.ebay_search)}&amp;mkcid=1&amp;mkrid=711-53200-19255-0&amp;siteid=0&amp;campid=5339142622&amp;customid=${cid}&amp;toolid=10001&amp;mkevt=1`;
  const pill = 'style="font-size:0.68rem;padding:3px 8px;text-decoration:none;"';
  const shop = [`<a href="${ebay}" target="_blank" rel="noopener" class="glossary-pill" ${pill}>Shop eBay</a>`];
  if (m.amazon_search) shop.push(`<a href="https://www.amazon.com/s?k=${plus(m.amazon_search)}&amp;tag=${CATALOG_AMAZON_TAG}" target="_blank" rel="noopener" class="glossary-pill glossary-pill-amazon" ${pill}>Shop Amazon</a>`);
  const note = m.card_note ? `\n          <div class="miner-card-note" style="font-size:0.72rem;color:#8899a8;line-height:1.35;margin:6px 0 2px;">${enc(m.card_note)}</div>` : '';
  return `<div class="miner-card" data-id="${m.id}" data-voltage="${m.voltage}" data-algo="${m.algorithm}" data-loki="${isLoki}" data-category="${lottery ? 'lottery' : 'null'}" data-search="${enc(search)}" onclick="goToCalculator('${m.id}')">
          <div class="miner-card-header">
            <span class="miner-name">${enc(m.name)}</span>
            ${badge}
          </div>
          <div class="miner-row2">
            <span class="miner-manufacturer">${enc(m.manufacturer)}</span>
            <div class="miner-coins"><span class="coin-primary">${prim.join(' / ')}</span>${also.length ? `<span class="coin-also">+ ${also.join(', ')}</span>` : ''}</div>
          </div>
          <div class="miner-specs">
            <div class="spec-item"><span class="spec-label">Hashrate</span><span class="spec-value hashrate">${fmtNum(m.hashrate)} ${m.unit}</span></div>
            <div class="spec-item"><span class="spec-label">Power</span><span class="spec-value">${Number(m.power_w)}W</span></div>
            <div class="spec-item"><span class="spec-label">Equivalent</span><span class="spec-value">${enc(m.equivalent)}</span></div>
          </div>${note}
          <div class="miner-card-footer">
            <span class="miner-footer-info">${kwh} kWh/day &middot; ${enc(noiseWord)}</span>
            <span class="calc-link">Calculate &#x2192;</span>
          </div>
          <div class="miner-shop-links" onclick="event.stopPropagation()">
            ${shop.join('\n            ')}
          </div>
        </div>`;
}

if (existsSync(CATALOG)) {
  let page = readFileSync(CATALOG, 'utf8');
  const hasCards = page.includes(START) && page.includes(END);
  const hasLd = page.includes(LD_START) && page.includes(LD_END);
  if (hasCards) {
    const blocks = [];
    let total = 0;
    for (const sec of SECTIONS) {
      const list = catalogMiners.filter((m) => m.algorithm === sec.algo)
        .sort((a, b) => groupRank(a) - groupRank(b) || hashBase(a) - hashBase(b) || a.name.localeCompare(b.name));
      if (!list.length) continue;
      for (const m of list) for (const f of ['name', 'manufacturer', 'hashrate', 'unit', 'power_w', 'equivalent', 'ebay_search', 'noise'])
        if (!m[f]) fail(`catalog: ${m.id} is missing ${f}`);
      const allCoins = [...new Set(list.flatMap((m) => m.coins.split(';').map((s) => s.trim()).filter((s) => shownCoins.has(s)).map(short)))];
      const also = allCoins.filter((c) => !sec.primary.includes(c));
      total += list.length;
      blocks.push(`    <section class="algo-section" data-algo="${sec.algo}">
      <div class="algo-header">
        <span class="algo-icon">${sec.icon}</span>
        <h2 class="algo-title">${sec.algo}</h2>
        <span class="algo-coins">${sec.label}${also.length ? ' &middot; also mines ' + also.join(', ') : ''}</span>
      </div>
      <div class="miners-grid">
${list.map(card).join('\n')}
      </div>
    </section>`);
    }
    if (total !== out.length) fail(`catalog has ${total} cards but calculator has ${out.length} miners`);
    page = page.slice(0, page.indexOf(START) + START.length) + '\n' + blocks.join('\n') + '\n    ' + page.slice(page.indexOf(END));
    if (hasLd) {
      const items = SECTIONS.flatMap((sec) => catalogMiners.filter((m) => m.algorithm === sec.algo)).map((m, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: `${m.name} - ${fmtNum(m.hashrate)} ${m.unit} ${SECTIONS.find((s) => s.algo === m.algorithm).ld} Miner (${m.voltage})`,
      }));
      const ld = {
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: 'Home Miner Catalog - ASIC Mining Hardware for Residential Setups',
        description: `Catalog of ${items.length} ASIC cryptocurrency miners for home mining, including SHA-256 Bitcoin miners, Scrypt Litecoin/Dogecoin miners, KHeavyHash Kaspa miners, and more. Filtered by voltage (120V, 240V, 120V conversion via Loki Kit or PSU Bypass) and algorithm.`,
        url: 'https://www.solarayeffect.com/miners.html', numberOfItems: items.length, itemListElement: items,
      };
      page = page.slice(0, page.indexOf(LD_START) + LD_START.length) + '\n  <script type="application/ld+json">' + JSON.stringify(ld).replace(/[^\x00-\x7F<>&]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') + '</script>\n  ' + page.slice(page.indexOf(LD_END));
    }
    writeFileSync(CATALOG, page);
    console.log(`generated miners.html catalog: ${total} cards in ${blocks.length} sections${hasLd ? ' + Google listing' : ''}`);
  } else {
    console.log('miners.html has no CATALOG markers yet - catalog left as is');
  }
}

// =====================================================================
// POOLS PAGE (pools.html): coin sections + the coin filter dropdown are
// written between markers from pools.csv, pool_sections.csv, coins.csv.
// =====================================================================
const POOLS_PAGE = join(ROOT, 'pools.html');
const P_START = '<!-- POOLS:START (generated at deploy from data/master/pools.csv - do not edit) -->';
const P_END = '<!-- POOLS:END -->';
const F_START = '<!-- COIN-FILTER:START -->';
const F_END = '<!-- COIN-FILTER:END -->';
const poolsCsv = load('pools.csv');
const sectionsCsv = load('pool_sections.csv');
const isLive = (r) => ['keep', 'add'].includes(r.status);
const PAYOUT_TERM = { fpps: 'fpps', pps: 'pps', pplns: 'pplns', solo: 'solo' };
const PAYOUT_DEFAULT = { fpps: 'FPPS', pps: 'PPS+', pplns: 'PPLNS', solo: 'Solo' };

function poolRow(p) {
  const types = p.payout_types.split(/\s+/).filter(Boolean);
  const labels = (p.payout_labels || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (labels.length && labels.length !== types.length) fail(`pools: ${p.pool} [${p.coin_section}] has ${types.length} payout types but ${labels.length} labels`);
  for (const t of types) if (!PAYOUT_TERM[t]) fail(`pools: ${p.pool} [${p.coin_section}] unknown payout type "${t}"`);
  const tags = types.map((t, i) => `<span class="payout-tag payout-${t} glossary-term" data-term="${PAYOUT_TERM[t]}">${enc(labels[i] || PAYOUT_DEFAULT[t])}</span>`).join('');
  const regions = p.regions.split(/\s+/).filter(Boolean).map((r) => `<span class="region-tag">${enc(r)}</span>`).join('');
  return `            <tr data-payouts="${types.join(' ')}">
              <td><a class="pool-link" href="${enc(p.url)}" target="_blank" rel="noopener">${enc(p.pool)} &#x2197;</a></td>
              <td>${enc(p.fee)}</td>
              <td>${tags}</td>
              <td>${enc(p.min_payout)}</td>
              <td>${regions}</td>
              <td>${enc(p.notes)}</td>
            </tr>`;
}

function shopLine(sec) {
  const links = sec.shop_links.split(';').filter(Boolean).map((l) => {
    const [label, term, cid] = l.split('|');
    const href = `https://www.ebay.com/sch/i.html?_nkw=${term}&amp;_sacat=179197&amp;mkcid=1&amp;mkrid=711-53200-19255-0&amp;siteid=0&amp;campid=5339142622&amp;customid=${cid}&amp;toolid=10001&amp;mkevt=1`;
    return `<a href="${href}" target="_blank" rel="noopener sponsored" style="color:var(--sola-teal);">${enc(label)} &#x2197;</a>`;
  });
  return links.length ? `\n      <p class="coin-shop" style="margin:0.25rem 0 1rem;font-size:0.9rem;">Shop on eBay: ${links.join(' &middot; ')}</p>` : '';
}

if (existsSync(POOLS_PAGE)) {
  let page = readFileSync(POOLS_PAGE, 'utf8');
  if (page.includes(P_START) && page.includes(P_END)) {
    const secs = sectionsCsv.filter(isLive).sort((a, b) => Number(a.order) - Number(b.order));
    let rowsTotal = 0;
    const html = secs.map((sec) => {
      const rows = poolsCsv.filter((p) => isLive(p) && p.coin_section === sec.section);
      if (!rows.length) fail(`pools: section ${sec.section} has no live pools`);
      rowsTotal += rows.length;
      return `    <!-- ${enc(sec.section)} -->
    <section class="coin-section" data-coin="${sec.data_coin}">
      <div class="coin-header">
        <span class="coin-icon">${sec.icon}</span>
        <h2 class="coin-name">${enc(sec.section)}</h2>
        <span class="coin-tag ${sec.tag_class}">${enc(sec.tag)}</span>
      </div>
      <p class="coin-note">${enc(sec.note)}</p>${shopLine(sec)}
      <div class="table-wrapper">
        <table class="pool-table">
          <thead>
            <tr>
              <th>Pool</th>
              <th>Fee</th>
              <th>Payout</th>
              <th>Min. Payout</th>
              <th>Regions</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
${rows.map(poolRow).join('\n')}
          </tbody>
        </table>
      </div>
    </section>`;
    }).join('\n\n');
    const orphan = poolsCsv.filter((p) => isLive(p) && !secs.some((s) => s.section === p.coin_section));
    if (orphan.length) fail(`pools: ${orphan.length} live pools have no live section (${orphan.map((p) => p.pool + ' / ' + p.coin_section).join(', ')})`);
    page = page.slice(0, page.indexOf(P_START) + P_START.length) + '\n' + html + '\n    ' + page.slice(page.indexOf(P_END));
    if (page.includes(F_START) && page.includes(F_END)) {
      const opts = ['        <option value="all">All Coins</option>'];
      for (const sec of secs) {
        const toks = sec.data_coin.split(/\s+/);
        for (const t of toks) {
          const c = coins.find((x) => x.symbol.toLowerCase() === t);
          const label = toks.length === 1 || !c ? sec.section : `${c.name} (${c.symbol})`;
          opts.push(`        <option value="${t}">${enc(label)}</option>`);
        }
      }
      page = page.slice(0, page.indexOf(F_START) + F_START.length) + '\n' + opts.join('\n') + '\n        ' + page.slice(page.indexOf(F_END));
    }
    writeFileSync(POOLS_PAGE, page);
    console.log(`generated pools.html: ${rowsTotal} pools in ${secs.length} coin sections`);
  } else {
    console.log('pools.html has no POOLS markers yet - pools page left as is');
  }
}

// =====================================================================
// SHOP RAILS + STRIPS: built from products.csv + settings.csv for every
// page listed in settings rail_pages. Pages hold markers:
//   <!-- SHOP-RAILS:START --> ... <!-- SHOP-RAILS:END -->           desktop rails
//   <!-- SHOP-STRIP:both|ebay|amazon:START --> ... :END -->        phone strips
// =====================================================================
const settings = Object.fromEntries(load('settings.csv').map((r) => [r.setting, r.value]));
const AMAZON_TAG = settings.amazon_tag;
const CAMPID = settings.ebay_campid;
if (!AMAZON_TAG || !CAMPID) fail('settings.csv needs amazon_tag and ebay_campid');
const RAIL_PAGES = (settings.rail_pages || '').split(/\s+/).filter(Boolean);
const RAIL_MIN = Number(settings.rail_min_items) || 6;
const products = load('products.csv').filter((p) => ['keep', 'add'].includes(p.status)).sort((a, b) => Number(a.order) - Number(b.order));
const q = (s) => encodeURIComponent(s.trim()).replace(/%20/g, '+').replace(/~/g, '%7E');
const DISCLAIMER = 'Verify model, voltage, and compatibility before purchasing. We are not responsible for incorrect orders, improper installation, misuse, or resulting damages.';
const UNIT_SCALE = { 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12, 'kSol/s': 1 };

function upTo(rule) {
  if (!rule) return '';
  const pool = miners.filter((m) => m.status === 'keep');
  const [kind, val] = rule.split(':');
  const notLoki = (m) => !/loki|bypass/i.test(m.build);
  const pick = kind === 'lottery' ? pool.filter((m) => m.lottery === 'yes')
    : kind === 'algo' ? pool.filter((m) => m.algorithm === val && m.lottery !== 'yes' && notLoki(m))
    : kind === 'name' ? pool.filter((m) => m.name.toLowerCase().includes(val.toLowerCase()) && m.lottery !== 'yes' && notLoki(m))
    : fail(`products: unknown upto rule "${rule}"`);
  if (!pick.length) fail(`products: upto rule "${rule}" matches no live miners`);
  const best = pick.reduce((a, b) => (Number(b.hashrate) * UNIT_SCALE[b.unit] > Number(a.hashrate) * UNIT_SCALE[a.unit] ? b : a));
  return `Up to ${Number(best.hashrate).toLocaleString('en-US')} ${best.unit}`;
}
const href = (p) => p.store === 'ebay'
  ? `https://www.ebay.com/sch/i.html?_nkw=${q(p.search_term)}&amp;_sacat=179197&amp;customid=${p.customid}&amp;mkcid=1&amp;mkrid=711-53200-19255-0&amp;siteid=0&amp;campid=${CAMPID}&amp;toolid=10001&amp;mkevt=1`
  : `https://www.amazon.com/s?k=${q(p.search_term)}&amp;tag=${AMAZON_TAG}`;
const icon = (ic) => ic.startsWith('img:')
  ? `<img src="/assets/rail/${ic.slice(4)}.png" alt="${ic.slice(4)}" width="28" height="28">`
  : `<span class="rail-emoji">${ic}</span>`;
for (const p of products) p._sub = p.upto ? upTo(p.upto) : p.sub || '&#160;';

function itemsFor(page, store) {
  const all = products.filter((p) => p.store === store);
  if (page === 'index') return all;
  const rel = all.filter((p) => p.pages.split(/\s+/).includes(page));
  for (const p of all) { if (rel.length >= RAIL_MIN) break; if (!rel.includes(p)) rel.push(p); }
  return rel.sort((a, b) => Number(a.order) - Number(b.order));
}
const row = (p) => `  <a class="mine-row" href="${href(p)}" target="_blank" rel="noopener sponsored">
    <div class="mine-left">${icon(p.icon_left)}</div>
    <div class="mine-info">
      <div class="mine-name">${p.product}</div>
      <div class="mine-hash">${p._sub}</div>
    </div>
    <div class="mine-right">${icon(p.icon_right)}</div>
  </a>`;
const disc = (side) => `  <div style="text-align:center;margin-${side}:6px;color:rgba(232,240,247,0.78);font-size:0.52rem;line-height:1.3;padding:0 6px;">${DISCLAIMER}</div>`;
function rails(page) {
  const top = page === 'index' ? 'managed' : 'auto';
  const one = (cls, label, title, store, footer) => `<aside class="${cls}" aria-label="${label}" data-top="${top}">
  <div class="rail-header">
    <div class="rail-site-label">SolaRayEffect.com</div>
    <div class="rail-title">${title}</div>
  </div>
  <div class="rail-divider"></div>
${disc('bottom')}
${itemsFor(page, store).map(row).join('\n')}
  <div class="rail-footer">Affiliate links &#x2022; ${footer}</div>
${disc('top')}
</aside>`;
  return `<link rel="stylesheet" href="/assets/rails.css">
<script src="/assets/rails.js" defer></script>
${one('affiliate-rail', 'Shop miners on eBay', 'Shop Miners', 'ebay', 'eBay')}
${one('affiliate-rail-right', 'Shop mining gear on Amazon', 'Shop Gear', 'amazon', 'Amazon')}`;
}
function strip(page, store) {
  const title = store === 'ebay' ? 'Shop Miners &#x2022; eBay' : 'Shop Gear &#x2022; Amazon';
  return `    <div class="mobile-affiliate-strip">
      <div class="strip-header">
        <div class="strip-label">SolaRayEffect.com</div>
        <div class="strip-title">${title}</div>
      </div>
      <div class="strip-scroll">
${itemsFor(page, store).map((p) => `        <a class="strip-btn" href="${href(p)}" target="_blank" rel="noopener sponsored">${p.short_name}</a>`).join('\n')}
      </div>
      <div class="strip-footer">Affiliate links &#x2022; ${store === 'ebay' ? 'eBay' : 'Amazon'} &#x2022; ${DISCLAIMER}</div>
    </div>`;
}
const between = (page, start, end, html) => {
  const i = page.indexOf(start), j = page.indexOf(end, i);
  if (i < 0 || j < 0) return null;
  return page.slice(0, i + start.length) + '\n' + html + '\n' + page.slice(j);
};
for (const name of RAIL_PAGES) {
  const file = join(ROOT, name + '.html');
  if (!existsSync(file)) fail(`settings rail_pages: ${name}.html does not exist`);
  let page = readFileSync(file, 'utf8');
  const done = [];
  const r = between(page, '<!-- SHOP-RAILS:START -->', '<!-- SHOP-RAILS:END -->', rails(name));
  if (r) { page = r; done.push('rails'); }
  for (const kind of ['both', 'ebay', 'amazon']) {
    const html = kind === 'both' ? strip(name, 'ebay') + '\n' + strip(name, 'amazon') : strip(name, kind);
    const s = between(page, `<!-- SHOP-STRIP:${kind}:START -->`, `<!-- SHOP-STRIP:${kind}:END -->`, html);
    if (s) { page = s; done.push('strip-' + kind); }
  }
  if (done.length) { writeFileSync(file, page); console.log(`generated shop rails on ${name}.html: ${done.join(', ')} (${itemsFor(name, 'ebay').length} eBay / ${itemsFor(name, 'amazon').length} Amazon)`); }
}
