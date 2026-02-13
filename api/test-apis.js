// Temporary test endpoint v2: /api/test-apis
// Tests alternative endpoints for all coins
// DELETE THIS FILE after testing

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const results = {};
  
  // === WORKING FROM V1 ===
  
  // ZEC - Blockchair (CONFIRMED WORKING)
  try {
    const r = await fetch('https://api.blockchair.com/zcash/stats');
    results.ZEC_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.ZEC_blockchair = { error: e.message }; }
  
  // XMR - Blockchair (CONFIRMED WORKING)
  try {
    const r = await fetch('https://api.blockchair.com/monero/stats');
    results.XMR_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.XMR_blockchair = { error: e.message }; }
  
  // === ALPH ALTERNATIVES ===
  
  // ALPH - Alephium backend API (official mainnet backend)
  try {
    const r = await fetch('https://backend.mainnet.alephium.org/infos');
    results.ALPH_backend = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_backend = { error: e.message }; }
  
  // ALPH - Alephium node API (node info)
  try {
    const r = await fetch('https://node.mainnet.alephium.org/infos/node');
    results.ALPH_node_info = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_node_info = { error: e.message }; }
  
  // ALPH - Node chain params
  try {
    const r = await fetch('https://node.mainnet.alephium.org/infos/chain-params');
    results.ALPH_chain_params = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_chain_params = { error: e.message }; }

  // ALPH - Backend hashrates
  try {
    const r = await fetch('https://backend.mainnet.alephium.org/infos/hashrates?interval-type=daily');
    results.ALPH_hashrates = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_hashrates = { error: e.message }; }
  
  // === CKB ALTERNATIVES ===
  
  // CKB - Nervos explorer with vnd.api+json header
  try {
    const r = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics', {
      headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' }
    });
    results.CKB_nervos_v1 = { status: r.status, data: await r.json() };
  } catch (e) { results.CKB_nervos_v1 = { error: e.message }; }
  
  // CKB - Try plain header
  try {
    const r = await fetch('https://mainnet-api.explorer.nervos.org/api/v1/statistics');
    results.CKB_nervos_plain = { status: r.status, data: await r.json() };
  } catch (e) { results.CKB_nervos_plain = { error: e.message }; }

  // === SC ALTERNATIVES ===
  
  // SC - SiaScan API
  try {
    const r = await fetch('https://siascan.com/api/mining');
    results.SC_siascan = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_siascan = { error: e.message }; }

  // SC - SiaStats network status
  try {
    const r = await fetch('https://siastats.info/dbs/network_status.json');
    results.SC_siastats = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_siastats = { error: e.message }; }
  
  // SC - Blockchair siacoin
  try {
    const r = await fetch('https://api.blockchair.com/siacoin/stats');
    results.SC_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_blockchair = { error: e.message }; }

  // === DGB ALTERNATIVES ===
  
  // DGB - NOWNodes (you already have a key)
  try {
    const NOWNODES_KEY = process.env.NOWNODES_API_KEY;
    const r = await fetch('https://dgbbook.nownodes.io/api/v2', {
      headers: { 'api-key': NOWNODES_KEY || '' }
    });
    results.DGB_nownodes = { status: r.status, data: await r.json() };
  } catch (e) { results.DGB_nownodes = { error: e.message }; }
  
  // DGB - DigiExplorer
  try {
    const r = await fetch('https://digiexplorer.info/api/getdifficulty');
    results.DGB_digiexplorer = { status: r.status, data: await r.json() };
  } catch (e) { results.DGB_digiexplorer = { error: e.message }; }
  
  // === KDA ALTERNATIVES ===
  
  // KDA - Chainweb cut (network-wide snapshot)
  try {
    const r = await fetch('https://api.chainweb.com/chainweb/0.0/mainnet01/cut');
    results.KDA_cut = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_cut = { error: e.message }; }

  // KDA - Kadena estats
  try {
    const r = await fetch('https://estats.chainweb.com/txs/recent?limit=1');
    results.KDA_estats = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_estats = { error: e.message }; }

  return res.status(200).json(results);
}
