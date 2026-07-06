// Completion tracking + per-headline guess distribution.
//
// POST { score, date, guesses? } — bumps the daily aggregates AND, for each
//   guessed year, increments guessdist:<date>:<idx> (a hash of year -> count).
//   This is the real data behind "how you compared" + the admin difficulty view
//   (replaces the old simulated stats). Backward compatible: guesses is optional.
//
// GET ?date=YYYY-MM-DD — returns the per-headline guess distribution for a date,
//   used by the results "review" screen and the admin difficulty view.
//
// Keys (append-only, no TTL — kept for historical difficulty analysis):
//   stats:<date>            HASH  completions / totalScore
//   stats:<date>:scores     LIST  every raw score (for the histogram)
//   stats:<date>:countries  HASH  country -> count
//   guessdist:<date>:<idx>  HASH  guessedYear -> count   (NEW)

export const config = { api: { bodyParser: true } };

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const MIN_YEAR = 1900;
const MAX_YEAR = 2026;
const MAX_HEADLINES = 10; // generous cap; daily is 5

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePost(req, res) {
  const { score, date, guesses, hints } = req.body || {};
  if (!isValidDate(date)) return res.status(400).json({ error: 'Missing/invalid date' });
  const numScore = Number(score) || 0;
  if (numScore < 0 || numScore > 5000) return res.status(400).json({ error: 'Invalid score' });

  // Vercel-injected geo header (ISO 3166-1 alpha-2, e.g. "GB"). Falls back to "XX"
  // for requests from environments without geo (local dev, bots, etc.).
  const countryRaw = req.headers['x-vercel-ip-country'] || '';
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : 'XX';

  const commands = [
    ['HINCRBY', `stats:${date}`, 'completions', 1],
    ['HINCRBY', `stats:${date}`, 'totalScore', numScore],
    ['RPUSH', `stats:${date}:scores`, numScore],
    ['HINCRBY', `stats:${date}:countries`, country, 1],
    ['HINCRBY', 'stats:countries:all', country, 1],
  ];

  // Per-headline guess distribution — one HINCRBY per valid guessed year.
  if (Array.isArray(guesses)) {
    guesses.slice(0, MAX_HEADLINES).forEach((g, i) => {
      const y = Math.round(Number(g));
      if (Number.isFinite(y) && y >= MIN_YEAR && y <= MAX_YEAR) {
        commands.push(['HINCRBY', `guessdist:${date}:${i}`, String(y), 1]);
      }
    });
  }

  // Hint-usage aggregation — the "do people want hints?" signal. hintGames =
  // players who used >=1 hint; hintUses = total hints; hintdist:<date> = which
  // headlines get hinted most (a difficulty signal). Admin surfaces these later.
  if (Array.isArray(hints)) {
    const used = hints.slice(0, MAX_HEADLINES).map(Boolean);
    const total = used.filter(Boolean).length;
    if (total > 0) {
      commands.push(['HINCRBY', `stats:${date}`, 'hintGames', 1]);
      commands.push(['HINCRBY', `stats:${date}`, 'hintUses', total]);
      used.forEach((u, i) => { if (u) commands.push(['HINCRBY', `hintdist:${date}`, String(i), 1]); });
    }
  }

  try {
    const result = await pipeline(commands);
    if (!result) return res.status(500).json({ error: 'Redis write failed' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function handleGet(req, res) {
  const date = req.query?.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Missing/invalid date' });

  // Round 1: the edition (for the true year per headline + how many headlines).
  const editionRaw = (await pipeline([['GET', `headlines:${date}`]]))?.[0]?.result;
  let edition = null;
  try { edition = typeof editionRaw === 'string' ? JSON.parse(editionRaw) : editionRaw; } catch { edition = null; }
  if (!Array.isArray(edition) || edition.length === 0) {
    return res.status(200).json({ date, headlines: [] });
  }

  // Round 2: the guess distribution for each headline index.
  const distRaw = await pipeline(edition.map((_, i) => ['HGETALL', `guessdist:${date}:${i}`]));

  const headlines = edition.map((h, i) => {
    const dist = hashToCounts(distRaw?.[i]?.result);
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    return {
      idx: i,
      year: typeof h?.year === 'number' ? h.year : null,
      text: typeof h?.text === 'string' ? h.text : '',
      total,
      dist,
    };
  });

  return res.status(200).json({ date, headlines });
}

// HGETALL returns [field, value, field, value, ...] -> { year: count } (ints).
function hashToCounts(raw) {
  const out = {};
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < raw.length; i += 2) {
    const y = parseInt(raw[i], 10);
    const c = parseInt(raw[i + 1], 10);
    if (Number.isFinite(y) && Number.isFinite(c)) out[y] = c;
  }
  return out;
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
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
