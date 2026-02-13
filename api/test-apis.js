// Temporary test endpoint: /api/test-apis
// Hit all proposed new coin APIs and return raw responses
// DELETE THIS FILE after testing

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const results = {};
  
  // 1. ZEC - zcha.in
  try {
    const r = await fetch('https://api.zcha.in/v2/mainnet/network');
    results.ZEC_zchain = { status: r.status, data: await r.json() };
  } catch (e) { results.ZEC_zchain = { error: e.message }; }
  
  // 2. ZEC - Blockchair
  try {
    const r = await fetch('https://api.blockchair.com/zcash/stats');
    results.ZEC_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.ZEC_blockchair = { error: e.message }; }
  
  // 3. XMR - xmrchain
  try {
    const r = await fetch('https://xmrchain.net/api/networkinfo');
    results.XMR_xmrchain = { status: r.status, data: await r.json() };
  } catch (e) { results.XMR_xmrchain = { error: e.message }; }
  
  // 4. XMR - Blockchair
  try {
    const r = await fetch('https://api.blockchair.com/monero/stats');
    results.XMR_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.XMR_blockchair = { error: e.message }; }
  
  // 5. ALPH - Alephium explorer
  try {
    const r = await fetch('https://explorer.alephium.org/api/infos');
    results.ALPH_explorer = { status: r.status, data: await r.json() };
  } catch (e) { results.ALPH_explorer = { error: e.message }; }
  
  // 6. CKB - Blockchair
  try {
    const r = await fetch('https://api.blockchair.com/nervos/stats');
    results.CKB_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.CKB_blockchair = { error: e.message }; }
  
  // 7. CKB - Nervos explorer
  try {
    const r = await fetch('https://explorer.nervos.org/api/v1/statistics');
    results.CKB_nervos = { status: r.status, data: await r.json() };
  } catch (e) { results.CKB_nervos = { error: e.message }; }
  
  // 8. SC - Sia API
  try {
    const r = await fetch('https://api.sia.tech/consensus');
    results.SC_sia = { status: r.status, data: await r.json() };
  } catch (e) { results.SC_sia = { error: e.message }; }
  
  // 9. DGB - Blockchair
  try {
    const r = await fetch('https://api.blockchair.com/digibyte/stats');
    results.DGB_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.DGB_blockchair = { error: e.message }; }
  
  // 10. KDA - Chainweb
  try {
    const r = await fetch('https://api.chainweb.com/chainweb/0.0/mainnet01/cut');
    results.KDA_chainweb = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_chainweb = { error: e.message }; }
  
  // 11. KDA - Blockchair
  try {
    const r = await fetch('https://api.blockchair.com/kadena/stats');
    results.KDA_blockchair = { status: r.status, data: await r.json() };
  } catch (e) { results.KDA_blockchair = { error: e.message }; }

  return res.status(200).json(results);
}
