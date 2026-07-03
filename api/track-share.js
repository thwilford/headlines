// Increments the per-day share counter for the day's stats hash.
// Pure additive HINCRBY — never overwrites existing values.

export const config = { api: { bodyParser: true } };

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: 'Redis env vars missing' });

  const { type, date } = req.body || {};
  if (type !== 'image' && type !== 'text') {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const serverDate = new Date().toISOString().split('T')[0];
  const useDate = isValidDate(date) ? date : serverDate;
  const field = type === 'image' ? 'imageShares' : 'textShares';

  const result = await redis(['HINCRBY', `stats:${useDate}`, field, 1]);
  if (!result) return res.status(500).json({ error: 'Redis write failed' });

  res.status(200).json({ ok: true });
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function redis(command) {
  try {
    const r = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
