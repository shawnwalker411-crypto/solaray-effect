// Temporary test endpoint v3: /api/test-apis
// Round 3 - new alternative endpoints
// DELETE THIS FILE after testing

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const results = {};
  
  // === ALPH - Try Blockchair (works for ZEC/XMR) ===
  try {
    const r = await fetch('https://api.blockchair.com/alephium/stats');
    results.ALPH_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_blockchair = { error: e.message }; }

  // === ALPH - Backend supply endpoint (might have hashrate) ===
  try {
    const r = await fetch('https://backend.mainnet.alephium.org/infos/supply/total-alph');
    results.ALPH_supply = { status: r.status, data: await r.text() };
  } catch (e) { results.ALPH_supply = { error: e.message }; }

  // === ALPH - Backend heights (might contain difficulty) ===
  try {
    const r = await fetch('https://backend.mainnet.alephium.org/infos/heights');
    results.ALPH_heights = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_heights = { error: e.message }; }

  // === ALPH - Node hashrate endpoint ===
  try {
    const r = await fetch('https://node.mainnet.alephium.org/infos/current-hashrate');
    results.ALPH_node_hashrate = { status: r.status, data: await r.text() };
  } catch (e) { results.ALPH_node_hashrate = { error: e.message }; }

  // === ALPH - Node self-clique ===
  try {
    const r = await fetch('https://node.mainnet.alephium.org/infos/self-clique');
    results.ALPH_selfclique = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_selfclique = { error: e.message }; }

  // === DGB - chainz.cryptoid.info (free, no key needed for basic) ===
  try {
    const r = await fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getdifficulty');
    const text = await r.text();
    results.DGB_cryptoid_diff = { status: r.status, data: text };
  } catch (e) { results.DGB_cryptoid_diff = { error: e.message }; }

  // DGB - cryptoid nethashps
  try {
    const r = await fetch('https://chainz.cryptoid.info/dgb/api.dws?q=nethashps');
    const text = await r.text();
    results.DGB_cryptoid_hashrate = { status: r.status, data: text };
  } catch (e) { results.DGB_cryptoid_hashrate = { error: e.message }; }

  // DGB - cryptoid getblockcount
  try {
    const r = await fetch('https://chainz.cryptoid.info/dgb/api.dws?q=getblockcount');
    const text = await r.text();
    results.DGB_cryptoid_height = { status: r.status, data: text };
  } catch (e) { results.DGB_cryptoid_height = { error: e.message }; }

  // === SC - Blockchair with "sia" not "siacoin" ===
  try {
    const r = await fetch('https://api.blockchair.com/sia/stats');
    results.SC_blockchair_sia = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_blockchair_sia = { error: e.message }; }

  // SC - cryptoid siacoin
  try {
    const r = await fetch('https://chainz.cryptoid.info/sc/api.dws?q=getdifficulty');
    const text = await r.text();
    results.SC_cryptoid_diff = { status: r.status, data: text };
  } catch (e) { results.SC_cryptoid_diff = { error: e.message }; }

  // SC - explore.sia.tech v2 (new Sia Foundation explorer)
  try {
    const r = await fetch('https://explore.sia.tech/api/consensus/state');
    results.SC_explore_state = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_explore_state = { error: e.message }; }

  // SC - explore.sia.tech network metrics
  try {
    const r = await fetch('https://explore.sia.tech/api/consensus/network');
    results.SC_explore_network = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_explore_network = { error: e.message }; }

  // === KDA - Try different Kadena explorer/stats endpoints ===
  try {
    const r = await fetch('https://api.chainweb.com/chainweb/0.0/mainnet01/chain/0/header?limit=1', {
      headers: { 'Accept': 'application/json;blockheader-encoding=object' }
    });
    results.KDA_header_chain0 = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_header_chain0 = { error: e.message }; }

  // KDA - Kadena graph/stats
  try {
    const r = await fetch('https://graph.kadena.network/stats');
    results.KDA_graph_stats = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_graph_stats = { error: e.message }; }

  // KDA - Blockchair kadena
  try {
    const r = await fetch('https://api.blockchair.com/kadena/stats');
    results.KDA_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_blockchair = { error: e.message }; }

  return res.status(200).json(results);
}
