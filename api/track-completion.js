export const config = { api: { bodyParser: true } };

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { score, date } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const numScore = Number(score) || 0;
  if (numScore < 0 || numScore > 5000) return res.status(400).json({ error: 'Invalid score' });

  try {
    // Atomic Redis operations — no read-modify-write race condition
    const result = await pipeline([
      ['HINCRBY', `stats:${date}`, 'completions', 1],
      ['HINCRBY', `stats:${date}`, 'totalScore', numScore],
      ['RPUSH', `stats:${date}:scores`, numScore],
    ]);

    if (!result) {
      return res.status(500).json({ error: 'Redis write failed' });
    }

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
