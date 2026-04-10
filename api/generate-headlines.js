// Daily headline generator for HEADLINES.
// - Caches today's 5 headlines under headlines:YYYY-MM-DD in Upstash Redis
// - Tracks every event ever shown in `used_events` with a timestamp
// - Recycles events after 18 months so the game can run forever
// - Pass ?debug=1 to see read/write status in the response

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const RECYCLE_DAYS = 540; // 18 months
const YEAR_AVOID_DAYS = 30;
const CATEGORIES = ['Sport', 'Pop Culture', 'Politics/World Events', 'Science/Tech', 'Crime/Scandal/Disaster'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const debug = req.query?.debug === '1';
  const debugInfo = { steps: [] };
  const log = (msg, data) => {
    if (debug) debugInfo.steps.push(data ? { msg, ...data } : { msg });
  };
  const respond = (status, body) =>
    res.status(status).json(debug ? { ...body, debug: debugInfo } : body);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return respond(500, { error: 'Redis env vars missing' });
  }

  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `headlines:${today}`;
  const NOW_MS = Date.now();
  const RECYCLE_CUTOFF = NOW_MS - RECYCLE_DAYS * 86400 * 1000;
  const YEAR_AVOID_CUTOFF = NOW_MS - YEAR_AVOID_DAYS * 86400 * 1000;

  // ── 1. Cache check ──────────────────────────────────────────────────────
  const cached = await kvGet(cacheKey, log);
  if (Array.isArray(cached) && cached.length === 5) {
    log('cache hit');
    return respond(200, { headlines: cached, source: 'cache' });
  }

  // ── 2. Load used_events ─────────────────────────────────────────────────
  let usedEvents = (await kvGet('used_events', log)) || [];
  if (!Array.isArray(usedEvents)) usedEvents = [];

  // ── 3. Filter to active recycling window ────────────────────────────────
  const activeEvents = usedEvents.filter(
    (e) => typeof e.addedAt === 'number' && e.addedAt >= RECYCLE_CUTOFF
  );

  // Build per-category blocked lists
  const blockedByCategory = {};
  for (const cat of CATEGORIES) blockedByCategory[cat] = [];
  for (const e of activeEvents) {
    const cat = e.category || 'Uncategorized';
    if (!blockedByCategory[cat]) blockedByCategory[cat] = [];
    if (e.eventDescription) blockedByCategory[cat].push(e.eventDescription);
  }

  const recentYears = [
    ...new Set(
      activeEvents
        .filter((e) => e.addedAt >= YEAR_AVOID_CUTOFF && Number.isInteger(e.year))
        .map((e) => e.year)
    ),
  ].sort();

  log('dedup state', {
    totalStored: usedEvents.length,
    activeInWindow: activeEvents.length,
    recentYearsCount: recentYears.length,
    blockedPerCategory: Object.fromEntries(
      Object.entries(blockedByCategory).map(([k, v]) => [k, v.length])
    ),
  });

  // ── 4. Build prompt ─────────────────────────────────────────────────────
  const blockedSection = CATEGORIES.map((cat) => {
    const items = blockedByCategory[cat] || [];
    const list = items.length > 0 ? items.map((d) => `  - ${d}`).join('\n') : '  (none yet)';
    return `${cat}:\n${list}`;
  }).join('\n\n');

  // Include uncategorized legacy entries
  const uncategorized = blockedByCategory['Uncategorized'] || [];
  const uncatSection = uncategorized.length > 0
    ? `\n\nUncategorized (legacy):\n${uncategorized.map((d) => `  - ${d}`).join('\n')}`
    : '';

  const yearsLine = recentYears.length
    ? `\nAVOID these years (used in the last ${YEAR_AVOID_DAYS} days): ${recentYears.join(', ')}\n`
    : '';

  const prompt = `You are creating headlines for a daily newspaper year-guessing game — think pub quiz meets front page.

Generate exactly 5 real historical newspaper headlines. Each headline must be dramatic, specific, factually accurate, and clearly tied to a single year. Players will see the headline and try to guess the year.

CATEGORIES — you MUST include exactly one headline from each of these five categories:
1. Sport
2. Pop Culture (music, film, TV, celebrity, fashion, art)
3. Politics/World Events (elections, treaties, wars, diplomacy, revolutions)
4. Science/Tech (discoveries, inventions, space, medicine, computing)
5. Crime/Scandal/Disaster (natural disasters, crashes, crimes, scandals, industrial accidents)

REQUIREMENTS:
- One headline per category, in any order
- All 5 from different years, ideally different decades
- Most should fall between 1900 and 2010 (the historical sweet spot)
- Occasionally include something from 2011–2024 for freshness — allowed but not required
- ALL CAPS, written like a real front-page headline
- Choose events that feel familiar to UK, US, and Australian audiences — but not exclusively from those countries
- ONLY include events you have factual knowledge of. Never invent or guess at events.

CRITICAL — DO NOT use any of the following events (organized by category). Avoid the same underlying event even if you reword the headline:

${blockedSection}${uncatSection}
${yearsLine}
Return ONLY a JSON array of 5 objects. Each object MUST have these fields:
- "category": one of "Sport", "Pop Culture", "Politics/World Events", "Science/Tech", "Crime/Scandal/Disaster"
- "eventKey": short unique slug like "moon-landing-1969" or "bhopal-disaster-1984"
- "eventDescription": short plain-English event name like "Moon landing" or "Bhopal gas disaster"
- "text": the headline (ALL CAPS, dramatic, newspaper style)
- "year": 4-digit year as a number
- "publication": real newspaper name
- "context": 2-3 sentence factual context

Return ONLY the JSON array. No markdown fences, no preamble, no explanation.`;

  // ── 5. Call Claude (with one retry on parse failure) ────────────────────
  let headlines = null;
  let lastError = null;

  for (let attempt = 1; attempt <= 2 && !headlines; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      log(`claude attempt ${attempt}`, { status: response.status });

      if (!response.ok) {
        lastError = `claude http ${response.status}`;
        continue;
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      const jsonStr = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed) && parsed.length === 5) {
        headlines = parsed;
      } else {
        lastError = `wrong shape: array=${Array.isArray(parsed)} length=${parsed?.length}`;
      }
    } catch (e) {
      lastError = e.message;
      log(`claude attempt ${attempt} threw`, { error: e.message });
    }
  }

  if (!headlines) {
    return respond(500, { error: 'Failed to generate headlines', detail: lastError });
  }

  // ── 6. Build cache value (frontend shape) and updated event list ────────
  const cacheValue = headlines.map((h, i) => ({
    id: `ai_${today}_${i + 1}`,
    text: h.text,
    year: h.year,
    publication: h.publication,
    pubColor: h.pubColor || '#1a1a1a',
    context: h.context,
    category: h.category || CATEGORIES[i] || 'Uncategorized',
  }));

  const newEntries = headlines.map((h, i) => ({
    eventKey: h.eventKey || slugify(h.text).slice(0, 60),
    eventDescription: h.eventDescription || h.text,
    year: h.year,
    category: h.category || CATEGORIES[i] || 'Uncategorized',
    addedAt: NOW_MS,
  }));
  const updatedEvents = [...usedEvents, ...newEntries];

  // ── 7. Write cache + updated event list ─────────────────────────────────
  const writeCacheOk = await kvSet(cacheKey, cacheValue, log);
  const writeEventsOk = await kvSet('used_events', updatedEvents, log);
  log('writes complete', { cache: writeCacheOk, events: writeEventsOk });

  return respond(200, { headlines: cacheValue, source: 'generated' });
}

// ── Upstash Redis REST helpers ────────────────────────────────────────────
async function kvGet(key, log) {
  try {
    const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (log) log(`kv get ${key}`, { status: r.status });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.result === null || data.result === undefined) return null;
    try {
      return JSON.parse(data.result);
    } catch {
      return data.result;
    }
  } catch (e) {
    if (log) log(`kv get ${key} threw`, { error: e.message });
    return null;
  }
}

async function kvSet(key, value, log) {
  try {
    const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    if (log) log(`kv set ${key}`, { status: r.status });
    if (!r.ok) {
      const errText = await r.text();
      if (log) log(`kv set ${key} failed`, { body: errText.slice(0, 300) });
      return false;
    }
    return true;
  } catch (e) {
    if (log) log(`kv set ${key} threw`, { error: e.message });
    return false;
  }
}

// Exported for reuse by other API routes
export { kvGet, kvSet, REDIS_URL, REDIS_TOKEN };

export async function kvPipeline(commands, log) {
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    if (log) log('kv pipeline', { status: r.status, commands: commands.length });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (log) log('kv pipeline threw', { error: e.message });
    return null;
  }
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
