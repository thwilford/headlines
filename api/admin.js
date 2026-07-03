// Consolidated admin endpoint (one Vercel function instead of three, to stay
// under the Hobby-plan 12-function limit). Dispatches on ?action=:
//   action=headlines  → all cached editions (past + upcoming) for the preview tab
//   action=stats      → per-day play stats, country tallies, Claude spend budget
//   action=spend      → real Anthropic org spend via the Admin API
//   action=difficulty → per-headline guess distribution for one date (which
//                       headlines are recognition-locked / everyone scatters)
// All read-only. Internal admin tab only.

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
const ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
const BUDGET_USD = 5;

export default async function handler(req, res) {
  const action = req.query?.action;
  if (action === 'headlines') return adminHeadlines(req, res);
  if (action === 'stats') return adminStats(req, res);
  if (action === 'spend') return adminSpend(req, res);
  if (action === 'users') return adminUsers(req, res);
  if (action === 'difficulty') return adminDifficulty(req, res);
  if (action === 'obscure') return adminObscure(req, res);
  return res.status(400).json({ error: 'Unknown admin action' });
}

// ── action=obscure ────────────────────────────────────────────────────────────
// Player "too obscure?" thumbs-down, aggregated per headline (most-flagged first)
// so we can see which headlines play as unfair — and feed it back to the prompt.
async function adminObscure(req, res) {
  const r = await redis(['LRANGE', 'feedback:obscure', '0', '-1']);
  const raw = r?.result || [];
  const byKey = new Map();
  for (const s of raw) {
    let e = null;
    try { e = typeof s === 'string' ? JSON.parse(s) : s; } catch { e = null; }
    if (!e || !e.text) continue;
    const key = `${e.text}`;
    const cur = byKey.get(key) || { text: e.text, year: e.year ?? null, category: e.category || null, publication: e.publication || null, count: 0, uuids: new Set(), lastTs: 0 };
    cur.count += 1;
    if (e.uuid) cur.uuids.add(e.uuid);
    if (typeof e.ts === 'number' && e.ts > cur.lastTs) cur.lastTs = e.ts;
    byKey.set(key, cur);
  }
  const items = [...byKey.values()]
    .map((c) => ({ text: c.text, year: c.year, category: c.category, publication: c.publication, count: c.count, players: c.uuids.size, lastTs: c.lastTs }))
    .sort((a, b) => b.players - a.players || b.count - a.count);
  return res.status(200).json({ items, total: raw.length });
}

// ── action=difficulty ─────────────────────────────────────────────────────────
// Per-headline guess distribution for one date. The score histogram is built
// client-side from the scores already returned by action=stats; this adds the
// per-headline spread so we can spot recognition-locked headlines (everyone
// scatters) vs. well-anchored ones.
async function adminDifficulty(req, res) {
  const date = req.query?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Missing/invalid date' });
  }
  const editionRaw = (await pipeline([['GET', `headlines:${date}`]]))?.[0]?.result;
  let edition = null;
  try { edition = typeof editionRaw === 'string' ? JSON.parse(editionRaw) : editionRaw; } catch { edition = null; }
  if (!Array.isArray(edition) || edition.length === 0) {
    return res.status(200).json({ date, headlines: [] });
  }
  const distRaw = await pipeline(edition.map((_, i) => ['HGETALL', `guessdist:${date}:${i}`]));
  const headlines = edition.map((h, i) => {
    const dist = {};
    const raw = distRaw?.[i]?.result;
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length; j += 2) {
        const y = parseInt(raw[j], 10);
        const c = parseInt(raw[j + 1], 10);
        if (Number.isFinite(y) && Number.isFinite(c)) dist[y] = c;
      }
    }
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    return {
      idx: i,
      year: typeof h?.year === 'number' ? h.year : null,
      text: typeof h?.text === 'string' ? h.text : '',
      category: h?.category || null,
      publication: h?.publication || null,
      total,
      dist,
    };
  });
  return res.status(200).json({ date, headlines });
}

// ── action=headlines ────────────────────────────────────────────────────────
async function adminHeadlines(req, res) {
  let cursor = '0';
  const keys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'headlines:????-??-??', 'COUNT', '200']);
    cursor = r?.result?.[0] || '0';
    keys.push(...(r?.result?.[1] || []));
  } while (cursor !== '0');

  if (keys.length === 0) return res.status(200).json({ days: [] });

  const results = await pipeline(keys.map((k) => ['GET', k]));
  if (!results) return res.status(500).json({ error: 'Redis read failed' });

  const days = [];
  for (let i = 0; i < keys.length; i++) {
    const date = keys[i].replace('headlines:', '');
    const raw = results[i]?.result;
    if (!raw) continue;
    let headlines = null;
    try { headlines = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { headlines = null; }
    if (Array.isArray(headlines) && headlines.length > 0) days.push({ date, headlines });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return res.status(200).json({ days });
}

// ── action=stats ─────────────────────────────────────────────────────────────
async function adminStats(req, res) {
  let cursor = '0';
  const dateKeys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'stats:????-??-??', 'COUNT', '100']);
    cursor = r?.result?.[0] || '0';
    dateKeys.push(...(r?.result?.[1] || []));
  } while (cursor !== '0');

  const commands = [];
  for (const key of dateKeys) {
    commands.push(['HGETALL', key]);
    commands.push(['LRANGE', `${key}:scores`, '0', '-1']);
    commands.push(['HGETALL', `${key}:countries`]);
  }
  commands.push(['HGETALL', 'stats:countries:all']);
  commands.push(['LRANGE', 'usage:refills', '0', '-1']);

  const results = await pipeline(commands);
  if (!results) return res.status(500).json({ error: 'Redis read failed' });

  const stats = {};
  for (let i = 0; i < dateKeys.length; i++) {
    const date = dateKeys[i].replace('stats:', '');
    const hash = results[i * 3]?.result || [];
    const scoresList = results[i * 3 + 1]?.result || [];
    const countryHash = results[i * 3 + 2]?.result || [];
    const obj = {};
    for (let j = 0; j < hash.length; j += 2) obj[hash[j]] = parseInt(hash[j + 1], 10) || 0;
    const countries = {};
    for (let j = 0; j < countryHash.length; j += 2) countries[countryHash[j]] = parseInt(countryHash[j + 1], 10) || 0;
    stats[date] = {
      visits: obj.visits || 0,
      completions: obj.completions || 0,
      totalScore: obj.totalScore || 0,
      scores: scoresList.map((s) => parseInt(s, 10)),
      countries,
      imageShares: obj.imageShares || 0,
      textShares: obj.textShares || 0,
    };
  }

  const allTimeRaw = results[dateKeys.length * 3]?.result || [];
  const countriesAllTime = {};
  for (let j = 0; j < allTimeRaw.length; j += 2) countriesAllTime[allTimeRaw[j]] = parseInt(allTimeRaw[j + 1], 10) || 0;

  const usageRaw = results[dateKeys.length * 3 + 1]?.result || [];
  const refills = usageRaw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  const spent = refills.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const usage = {
    budget: BUDGET_USD,
    spent,
    remaining: BUDGET_USD - spent,
    pctUsed: BUDGET_USD > 0 ? Math.min(100, (spent / BUDGET_USD) * 100) : 0,
    refills: refills.length,
    firstRefillAt: refills[0]?.ts || null,
    lastRefillAt: refills[refills.length - 1]?.ts || null,
  };

  return res.status(200).json({ stats, countriesAllTime, usage });
}

// ── action=spend ─────────────────────────────────────────────────────────────
async function adminSpend(req, res) {
  if (!ADMIN_KEY) {
    return res.status(200).json({
      configured: false,
      error: 'ANTHROPIC_ADMIN_KEY not set. Create one at console.anthropic.com → Settings → Admin API keys, then add it to Vercel project env.',
    });
  }
  const now = new Date();
  const startingAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', startingAt);
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');
    const r = await fetch(url, { headers: { 'X-Api-Key': ADMIN_KEY, 'anthropic-version': '2023-06-01' } });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return res.status(200).json({ configured: true, error: `Anthropic Admin API returned ${r.status}: ${body.slice(0, 200)}` });
    }
    const data = await r.json();
    const buckets = Array.isArray(data?.data) ? data.data : [];
    let monthCents = 0;
    const monthDailyDollars = [];
    for (const bucket of buckets) {
      const date = bucket.starting_at?.split('T')[0] || null;
      let dayCents = 0;
      for (const item of (bucket.results || [])) {
        const v = parseFloat(item.amount);
        if (Number.isFinite(v)) dayCents += v;
      }
      monthCents += dayCents;
      if (date) monthDailyDollars.push({ date, cost: dayCents / 100 });
    }
    return res.status(200).json({
      configured: true,
      monthSpendDollars: monthCents / 100,
      monthDailyDollars,
      monthStart: startingAt,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({ configured: true, error: `Request failed: ${e.message}` });
  }
}

// ── action=users (registered email members) ─────────────────────────────────
async function adminUsers(req, res) {
  let cursor = '0';
  const keys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'auth:user:*', 'COUNT', '200']);
    cursor = r?.result?.[0] || '0';
    keys.push(...(r?.result?.[1] || []));
  } while (cursor !== '0');

  if (keys.length === 0) return res.status(200).json({ users: [], count: 0 });

  const results = await pipeline(keys.map((k) => ['GET', k]));
  const users = [];
  for (const row of (results || [])) {
    let u = null;
    try { u = JSON.parse(row?.result); } catch { u = null; }
    if (u?.email) {
      const weekly = Array.isArray(u.weekly) ? u.weekly : [];
      users.push({ email: u.email, createdAt: u.createdAt || null, daysPlayed: weekly.length, country: u.country || null });
    }
  }
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.status(200).json({ users, count: users.length });
}

// ── Upstash REST helpers ─────────────────────────────────────────────────────
async function redis(command) {
  try {
    const r = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function pipeline(commands) {
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
