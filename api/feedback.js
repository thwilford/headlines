// Player feedback collection.
// POST: store a feedback message  { message, score, date }
// GET:  list recent feedback (admin use)
//
// Storage: LPUSH into 'feedback:all' (capped to MAX_ENTRIES newest).
// Append-only — never touches any existing key.

export const config = { api: { bodyParser: true } };

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'feedback:all';
const MAX_ENTRIES = 500;
const MAX_LENGTH = 1000;

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  if (req.method === 'POST') {
    const { message, score, date, email } = req.body || {};
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing message' });
    }
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
      return res.status(400).json({ error: 'Invalid message length' });
    }
    // Optional reply-to email — loosely validated, stored only if it looks like
    // an email. Lets Tom follow up with a question; never required to submit.
    const cleanEmail =
      typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254
        ? email.trim().toLowerCase()
        : null;
    const cleanScore = typeof score === 'number' && score >= 0 && score <= 5000 ? score : null;
    const cleanDate = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
      ? date
      : new Date().toISOString().split('T')[0];
    // Vercel-injected geo header (ISO 3166-1 alpha-2, e.g. "GB"). Falls back
    // to "XX" for local dev / bots / requests without geo.
    const countryRaw = req.headers['x-vercel-ip-country'] || '';
    const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'XX';
    const entry = JSON.stringify({
      message: trimmed,
      email: cleanEmail,
      score: cleanScore,
      ts: Date.now(),
      date: cleanDate,
      country,
    });
    const result = await pipeline([
      ['LPUSH', KEY, entry],
      ['LTRIM', KEY, '0', String(MAX_ENTRIES - 1)],
    ]);
    if (!result) return res.status(500).json({ error: 'Redis write failed' });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const r = await redis(['LRANGE', KEY, '0', String(MAX_ENTRIES - 1)]);
    const raw = r?.result || [];
    const items = raw
      .map(s => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean);
    return res.status(200).json({ items });
  }

  return res.status(405).json({ error: 'Method not allowed' });
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
