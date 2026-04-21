const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  // Scan for all stats:YYYY-MM-DD keys
  let cursor = '0';
  const dateKeys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'stats:????-??-??', 'COUNT', '100']);
    cursor = r?.result?.[0] || '0';
    const keys = r?.result?.[1] || [];
    dateKeys.push(...keys);
  } while (cursor !== '0');

  if (dateKeys.length === 0) {
    return res.status(200).json({ stats: {} });
  }

  // Build pipeline to fetch all stats
  const commands = [];
  for (const key of dateKeys) {
    commands.push(['HGETALL', key]);
    commands.push(['LRANGE', `${key}:scores`, '0', '-1']);
  }

  const results = await pipeline(commands);
  if (!results) {
    return res.status(500).json({ error: 'Redis read failed' });
  }

  const stats = {};
  for (let i = 0; i < dateKeys.length; i++) {
    const date = dateKeys[i].replace('stats:', '');
    const hash = results[i * 2]?.result || [];
    const scoresList = results[i * 2 + 1]?.result || [];

    // HGETALL returns flat array: [key, val, key, val, ...]
    const obj = {};
    for (let j = 0; j < hash.length; j += 2) {
      obj[hash[j]] = parseInt(hash[j + 1], 10) || 0;
    }

    stats[date] = {
      completions: obj.completions || 0,
      totalScore: obj.totalScore || 0,
      scores: scoresList.map(s => parseInt(s, 10)),
    };
  }

  res.status(200).json({ stats });
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
