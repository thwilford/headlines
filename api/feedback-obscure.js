// Records a "too obscure" thumbs-down from a player on a specific headline.
// Append-only to `feedback:obscure` in Redis. Does NOT read or modify any
// existing key — purely additive instrumentation so we can tune the
// generator prompt based on real signal.

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  const { uuid, date, text, year, category, publication } = req.body || {};

  if (!uuid || typeof uuid !== 'string' || uuid.length < 8) {
    return res.status(400).json({ error: 'Invalid uuid' });
  }
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }

  const entry = {
    ts: Date.now(),
    uuid,
    date: typeof date === 'string' ? date : null,
    text: String(text).slice(0, 300),
    year: typeof year === 'number' ? year : null,
    category: typeof category === 'string' ? category : null,
    publication: typeof publication === 'string' ? publication : null,
  };

  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['RPUSH', 'feedback:obscure', JSON.stringify(entry)],
      ]),
    });
    if (!r.ok) {
      return res.status(500).json({ error: 'Redis write failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
