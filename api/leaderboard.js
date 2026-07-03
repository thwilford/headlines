// Leaderboard API -- Upstash Redis sorted sets, one board per day.
//
// POST: submit a score   { uuid, score, date? }
//   - score is keyed by uuid (ZADD NX -- first submission of the day sticks).
//   - country comes from Vercel's geo header (authoritative, present even for
//     logged-out players); name is resolved server-side from the hl_session
//     cookie, so a name only appears for signed-in users and can't be spoofed.
//
// GET:  retrieve board    ?uuid=xxx&date=yyyy-mm-dd
//   Returns a scrollable slice -- the top few rows, a window around the player,
//   and the set of countries playing today -- plus rank/percentile for the
//   "you beat X%" line.
//
// Keys (all expire after 48h):
//   lb:<date>        ZSET  uuid -> score
//   lb:<date>:meta   HASH  uuid -> "<CC><name>"  (CC = 2-char country, then name)
//
// The "countries playing today" strip reads stats:<date>:countries (the same
// hash the admin and track-completion use) so the two never disagree -- rather
// than maintaining a second, divergent country set here.

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const TTL = 172800; // 48h
const TOP_N = 5;     // rows shown at the top of the board
const WINDOW = 2;    // rows above/below the player in the "around you" window

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  const serverDate = new Date().toISOString().split('T')[0];

  if (req.method === 'POST') {
    const clientDate = req.body?.date;
    const date = isValidDate(clientDate) ? clientDate : serverDate;
    return handleSubmit(req, res, date);
  }
  if (req.method === 'GET') {
    const clientDate = req.query?.date;
    const date = isValidDate(clientDate) ? clientDate : serverDate;
    return handleGet(req, res, date);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSubmit(req, res, date) {
  const lbKey = `lb:${date}`;
  const { uuid, score } = req.body || {};

  if (!uuid || typeof uuid !== 'string' || uuid.length < 8) {
    return res.status(400).json({ error: 'Invalid uuid' });
  }
  if (typeof score !== 'number' || score < 0 || score > 5000) {
    return res.status(400).json({ error: 'Invalid score (must be 0-5000)' });
  }

  // Country from Vercel geo header (ISO 3166-1 alpha-2). 'XX' when unavailable.
  const countryRaw = req.headers['x-vercel-ip-country'] || '';
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'XX';

  // Name only for signed-in players -- resolved from the session cookie so it
  // can't be spoofed by an anonymous POST. Empty string => renders as Anonymous.
  const name = await nameFromSession(req);

  // Note: the per-day country list for the strip lives in stats:<date>:countries
  // (written by track-completion). We don't duplicate it here.
  const result = await pipeline([
    // ZADD NX -- only the first submission per uuid per day counts.
    ['ZADD', lbKey, 'NX', score, uuid],
    // Always refresh the display meta (cheap; lets a late sign-in show a name).
    ['HSET', `${lbKey}:meta`, uuid, `${country}${name}`],
    ['EXPIRE', lbKey, TTL],
    ['EXPIRE', `${lbKey}:meta`, TTL],
  ]);
  if (!result) return res.status(500).json({ error: 'Redis write failed' });

  const added = result[0]?.result === 1;
  return res.status(200).json({ ok: true, added });
}

async function handleGet(req, res, date) {
  const lbKey = `lb:${date}`;
  const uuid = req.query?.uuid;

  // Round 1: total, top slice, the player's rank + score, and the country
  // tallies (shared with admin / track-completion so the strip can't disagree).
  const commands = [
    ['ZCARD', lbKey],
    ['ZREVRANGE', lbKey, '0', String(TOP_N - 1), 'WITHSCORES'],
    ['HGETALL', `stats:${date}:countries`],
  ];
  if (uuid) {
    commands.push(['ZREVRANK', lbKey, uuid]);
    commands.push(['ZSCORE', lbKey, uuid]);
  }

  const r1 = await pipeline(commands);
  if (!r1) return res.status(500).json({ error: 'Redis read failed' });

  const totalPlayers = r1[0]?.result || 0;
  const topRaw = r1[1]?.result || [];
  const countries = parseCountryHash(r1[2]?.result);

  const top = parsePairs(topRaw, 0);

  let rank = null;
  let percentile = null;
  let playerScore = null;
  let around = [];

  if (uuid) {
    const revRank = r1[3]?.result;
    const ps = r1[4]?.result;
    if (revRank !== null && revRank !== undefined) {
      rank = revRank + 1; // 0-indexed -> 1-indexed
      playerScore = parseInt(ps, 10);
      percentile = totalPlayers > 1
        ? Math.round(((totalPlayers - revRank - 1) / (totalPlayers - 1)) * 100)
        : 100;

      // Window around the player -- only when they sit below the top slice.
      if (revRank >= TOP_N) {
        const start = Math.max(TOP_N, revRank - WINDOW);
        const end = revRank + WINDOW;
        const aroundRaw = (await pipeline([
          ['ZREVRANGE', lbKey, String(start), String(end), 'WITHSCORES'],
        ]))?.[0]?.result || [];
        around = parsePairs(aroundRaw, start);
      }
    }
  }

  // Resolve names + flags for every displayed row in one HMGET.
  const rows = [...top, ...around];
  if (rows.length) {
    const metaRaw = (await pipeline([
      ['HMGET', `${lbKey}:meta`, ...rows.map(r => r.uuid)],
    ]))?.[0]?.result || [];
    rows.forEach((row, i) => {
      const { country, name } = parseMeta(metaRaw[i]);
      row.country = country;
      row.name = name;
      row.isYou = !!(uuid && row.uuid === uuid);
      delete row.uuid; // don't leak uuids to the client
    });
  }

  return res.status(200).json({
    totalPlayers,
    rank,
    percentile,
    playerScore,
    top,
    around,
    countries,
  });
}

// -- helpers -----------------------------------------------------------------

// Parse ZREVRANGE ... WITHSCORES output ([member, score, member, score, ...])
// into ranked rows. startRank is the 0-indexed rank of the first member.
function parsePairs(raw, startRank) {
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push({ rank: startRank + i / 2 + 1, uuid: raw[i], score: parseInt(raw[i + 1], 10) });
  }
  return out;
}

// HGETALL on stats:<date>:countries returns [country, count, country, count...].
// Return the real country codes (drop 'XX'), most-played first, so the strip
// leads with the most active countries.
function parseCountryHash(raw) {
  if (!Array.isArray(raw)) return [];
  const pairs = [];
  for (let i = 0; i < raw.length; i += 2) {
    const cc = raw[i];
    if (typeof cc === 'string' && /^[A-Z]{2}$/.test(cc) && cc !== 'XX') {
      pairs.push([cc, parseInt(raw[i + 1], 10) || 0]);
    }
  }
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs.map(p => p[0]);
}

// Meta value is a fixed 2-char country prefix followed by the (possibly empty)
// display name. Country codes are always exactly 2 chars, so no separator.
function parseMeta(v) {
  if (typeof v !== 'string' || v.length < 2) return { country: 'XX', name: '' };
  return { country: v.slice(0, 2), name: v.slice(2) };
}

// Read the signed-in player's display name from the session cookie. Returns ''
// for logged-out players (or any lookup miss) so the row renders as Anonymous.
async function nameFromSession(req) {
  try {
    const raw = req.headers?.cookie || '';
    const m = raw.match(/(?:^|;\s*)hl_session=([^;]+)/);
    if (!m) return '';
    const token = decodeURIComponent(m[1]);
    const email = await redisGet(`auth:session:${token}`);
    if (!email) return '';
    const userRaw = await redisGet(`auth:user:${email}`);
    if (!userRaw) return '';
    const user = JSON.parse(userRaw);
    return sanitizeName(user?.name);
  } catch {
    return '';
  }
}

// Strip control chars, collapse whitespace, cap length. Mirrors the auth-side
// sanitizer so a stored name never breaks the fixed-width meta layout.
function sanitizeName(n) {
  if (typeof n !== 'string') return '';
  return Array.from(n)
    .filter(ch => ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) !== 0x7f)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

async function redisGet(key) {
  const r = await pipeline([['GET', key]]);
  return r?.[0]?.result ?? null;
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

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}
