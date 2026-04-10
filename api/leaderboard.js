// Leaderboard API — uses Upstash Redis sorted sets.
// POST: submit a score   { uuid, score }
// GET:  retrieve board    ?uuid=xxx
// Returns: { rank, totalPlayers, percentile, top10: [{rank, score}] }

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  const today = new Date().toISOString().split('T')[0];
  const lbKey = `lb:${today}`;

  if (req.method === 'POST') {
    return handleSubmit(req, res, lbKey);
  }
  if (req.method === 'GET') {
    return handleGet(req, res, lbKey);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSubmit(req, res, lbKey) {
  const { uuid, score } = req.body || {};

  if (!uuid || typeof uuid !== 'string' || uuid.length < 8) {
    return res.status(400).json({ error: 'Invalid uuid' });
  }
  if (typeof score !== 'number' || score < 0 || score > 5000) {
    return res.status(400).json({ error: 'Invalid score (must be 0-5000)' });
  }

  // ZADD NX — only add if this UUID hasn't submitted today
  const result = await pipeline([
    ['ZADD', lbKey, 'NX', score, uuid],
    ['EXPIRE', lbKey, 172800], // auto-cleanup after 48 hours
  ]);

  if (!result) {
    return res.status(500).json({ error: 'Redis write failed' });
  }

  const added = result[0]?.result === 1;
  return res.status(200).json({ ok: true, added });
}

async function handleGet(req, res, lbKey) {
  const uuid = req.query?.uuid;

  // Pipeline: get rank, total players, and top 10 in one round trip
  const commands = [
    ['ZCARD', lbKey],
    ['ZREVRANGE', lbKey, '0', '9', 'WITHSCORES'],
  ];
  if (uuid) {
    commands.push(['ZREVRANK', lbKey, uuid]);
    commands.push(['ZSCORE', lbKey, uuid]);
  }

  const result = await pipeline(commands);
  if (!result) {
    return res.status(500).json({ error: 'Redis read failed' });
  }

  const totalPlayers = result[0]?.result || 0;

  // Parse top 10 — ZREVRANGE WITHSCORES returns [member, score, member, score, ...]
  const rawTop = result[1]?.result || [];
  const top10 = [];
  for (let i = 0; i < rawTop.length; i += 2) {
    top10.push({ rank: Math.floor(i / 2) + 1, score: parseInt(rawTop[i + 1], 10) });
  }

  const response = { totalPlayers, top10 };

  if (uuid) {
    const revRank = result[2]?.result;
    const playerScore = result[3]?.result;

    if (revRank !== null && revRank !== undefined) {
      response.rank = revRank + 1; // 0-indexed → 1-indexed
      response.percentile =
        totalPlayers > 1
          ? Math.round(((totalPlayers - revRank - 1) / (totalPlayers - 1)) * 100)
          : 100;
      response.playerScore = parseInt(playerScore, 10);
    }
  }

  return res.status(200).json(response);
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
