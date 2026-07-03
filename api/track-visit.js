// Tracks a page visit. Called by the client once per UTC day per browser so
// the analytics tab can show visits alongside completions and shares without
// double-counting refreshes. Mirrors track-completion.js structure.

export const config = { api: { bodyParser: true } };

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { date } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  // Vercel-injected geo header (same as track-completion).
  const countryRaw = req.headers['x-vercel-ip-country'] || '';
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'XX';

  try {
    const result = await pipeline([
      ['HINCRBY', `stats:${date}`, 'visits', 1],
      ['HINCRBY', `stats:${date}:visitCountries`, country, 1],
    ]);
    if (!result) return res.status(500).json({ error: 'Redis write failed' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function pipeline(commands) {
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
