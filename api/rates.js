// Vercel serverless function: EUR-based exchange rates (no client data involved). GET /api/rates
module.exports = async function handler(req, res) {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/EUR');
    const j = await r.json();
    if (!r.ok || j.result !== 'success' || !j.rates) throw new Error('rates unavailable');
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ base: 'EUR', date: j.time_last_update_utc || '', rates: j.rates });
  } catch (e) {
    res.status(503).json({ error: 'Live exchange rates unavailable: ' + e.message });
  }
};
