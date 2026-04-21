// Daily headline generator for HEADLINES.
// - Caches today's 5 headlines under headlines:YYYY-MM-DD in Upstash Redis
// - Tracks every event ever shown in `used_events` with a timestamp
// - Recycles events after 18 months so the game can run forever
// - Pass ?debug=1 to see read/write status in the response

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

const RECYCLE_DAYS = 540; // 18 months — soft dedup window
const HARD_BLOCK_DAYS = 365; // 12 months — NEVER repeat a topic shown in this window
const YEAR_AVOID_DAYS = 30;
const MAX_ATTEMPTS = 3;
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

  // Use client-sent date (local midnight, like Wordle) or fall back to server UTC
  const clientDate = req.body?.date;
  const today = isValidDate(clientDate) ? clientDate : new Date().toISOString().split('T')[0];
  const cacheKey = `headlines:${today}`;
  const NOW_MS = Date.now();
  const RECYCLE_CUTOFF = NOW_MS - RECYCLE_DAYS * 86400 * 1000;
  const HARD_BLOCK_CUTOFF = NOW_MS - HARD_BLOCK_DAYS * 86400 * 1000;
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

  // ── 3. Filter to active windows ─────────────────────────────────────────
  const activeEvents = usedEvents.filter(
    (e) => typeof e.addedAt === 'number' && e.addedAt >= RECYCLE_CUTOFF
  );
  const hardBlockEvents = activeEvents.filter((e) => e.addedAt >= HARD_BLOCK_CUTOFF);
  const softBlockEvents = activeEvents.filter((e) => e.addedAt < HARD_BLOCK_CUTOFF);

  // Precompute fingerprints once (used for prompt + post-gen validation)
  const hardBlockFingerprints = hardBlockEvents.map((e) => ({
    event: e,
    keywords: fingerprint(`${e.eventDescription || ''} ${e.eventKey || ''}`),
  }));
  const softBlockFingerprints = softBlockEvents.map((e) => ({
    event: e,
    keywords: fingerprint(`${e.eventDescription || ''} ${e.eventKey || ''}`),
  }));

  // Collect distinctive tokens from last-365-day events (≥5 chars, proper-noun-like)
  const hardBlockTokens = new Set();
  for (const { keywords } of hardBlockFingerprints) {
    for (const tok of keywords) if (tok.length >= 5) hardBlockTokens.add(tok);
  }

  const hardBlockDescriptions = hardBlockEvents
    .filter((e) => e.eventDescription)
    .map((e) => e.eventDescription);
  const softBlockDescriptions = softBlockEvents
    .filter((e) => e.eventDescription)
    .map((e) => e.eventDescription);

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
    hardBlockedEvents: hardBlockEvents.length,
    softBlockedEvents: softBlockEvents.length,
    hardBlockedTokens: hardBlockTokens.size,
    recentYearsCount: recentYears.length,
  });

  // ── 4. Build prompt ─────────────────────────────────────────────────────
  const hardTokensList = [...hardBlockTokens].sort().join(', ');
  const hardBlockSection = hardBlockDescriptions.length > 0
    ? hardBlockDescriptions.map((d) => `  - ${d}`).join('\n')
    : '  (none yet)';
  const softBlockSection = softBlockDescriptions.length > 0
    ? softBlockDescriptions.map((d) => `  - ${d}`).join('\n')
    : '  (none yet)';

  const yearsLine = recentYears.length
    ? `\nAVOID these years (used in the last ${YEAR_AVOID_DAYS} days): ${recentYears.join(', ')}\n`
    : '';

  const prompt = `You are creating headlines for a daily newspaper year-guessing game — think pub quiz meets front page.

ABSOLUTE HARD-BLOCK LIST — you MUST NOT produce any headline that touches these subjects, people, organisations, franchises, events or recurring topics. Each has been used within the last ${HARD_BLOCK_DAYS} days. Even a different year of the same recurring topic is BANNED (e.g. if Tour de France 2003 is in the list, no other Tour de France year is allowed; if Kasparov vs Deep Blue 1997 is listed, no other chess-computer match is allowed).

Banned entity/keyword tokens (if your headline text or subject contains ANY of these words, it is an automatic reject):
${hardTokensList || '(none yet)'}

Banned event descriptions:
${hardBlockSection}

Secondary avoid list — events from 12–18 months ago. Strongly prefer not to repeat these, and never reuse the same specific event:
${softBlockSection}

--- END OF BLOCK LISTS ---

Generate exactly 5 real historical newspaper headlines. Each headline must be dramatic, specific, factually accurate, and clearly tied to a single year. Players will see the headline and try to guess the year.

CATEGORIES — you MUST include exactly one headline from each of these five categories:
1. Sport
2. Pop Culture (music, film, TV, celebrity, fashion, art)
3. Politics/World Events (elections, treaties, wars, diplomacy, revolutions)
4. Science/Tech (discoveries, inventions, space, medicine, computing)
5. Crime/Scandal/Disaster (natural disasters, crashes, crimes, scandals, industrial accidents)

DIFFICULTY — THIS IS CRITICAL:
This game must feel fun and achievable, like a pub quiz or Wordle — NOT like a history exam.
- Choose events that most adults would recognise from pop culture, movies, songs, memes, or casual conversation
- The headline should contain enough context clues that even someone who doesn't know the exact year can make a reasonable guess (within 10-15 years)
- GOOD examples: Titanic sinking, Moon landing, Beatles, Princess Diana, Berlin Wall, 9/11, iPhone launch, Usain Bolt, Chernobyl, World Cup moments, Olympic moments, major movie releases
- BAD examples: Obscure treaties, minor political events, niche scientific papers, regional disasters unknown outside one country
- Think "things your parents or friends would know at a dinner party" — not "things a history professor would quiz you on"
- The headline text itself should include helpful clues like names, places, or cultural references that anchor it to an era

REQUIREMENTS:
- One headline per category, in any order
- All 5 from different years, ideally different decades
- Most should fall between 1900 and 2010 (the historical sweet spot)
- Occasionally include something from 2011–2024 for freshness — allowed but not required
- ALL CAPS, written like a real front-page headline
- Choose events that feel familiar to UK, US, and Australian audiences — but not exclusively from those countries
- ONLY include events you have factual knowledge of. Never invent or guess at events.

Remember the ABSOLUTE HARD-BLOCK LIST at the top of this prompt — none of those topics, people, franchises or recurring events are allowed in any form.
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

  // ── 5. Call Claude with retries on parse failure or topic dup ───────────
  let headlines = null;
  let lastError = null;
  let lastDupes = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !headlines; attempt++) {
    const attemptPrompt = attempt === 1
      ? prompt
      : `${prompt}

YOUR PREVIOUS ATTEMPT PROPOSED THESE HEADLINES WHICH OVERLAP WITH ALREADY-USED TOPICS — DO NOT PROPOSE THESE OR ANY TOPIC INVOLVING THE SAME PEOPLE, ORGANISATIONS, FRANCHISES, EVENTS OR RECURRING SUBJECTS:
${lastDupes.map((d) => `  - "${d.proposed}" overlaps with previously used "${d.blocked}" (shared: ${d.shared.join(', ')})`).join('\n')}

Pick entirely different subjects this time. Do not reuse the same athletes, teams, tournaments, companies, franchises, people, films, or recurring events that appeared in the blocked list — even if you'd use a different year. This is attempt ${attempt} of ${MAX_ATTEMPTS}; after ${MAX_ATTEMPTS} the day will fail with an error.`;

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
          messages: [{ role: 'user', content: attemptPrompt }],
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

      if (!Array.isArray(parsed) || parsed.length !== 5) {
        lastError = `wrong shape: array=${Array.isArray(parsed)} length=${parsed?.length}`;
        continue;
      }

      // Topic-overlap check — hard block (any 1 distinctive token ≥5 chars) vs
      // soft block (≥2 shared tokens, year-agnostic).
      const hardDupes = findTopicDupes(parsed, hardBlockFingerprints, { threshold: 1, minLen: 5 });
      const softDupes = findTopicDupes(parsed, softBlockFingerprints, { threshold: 2, minLen: 4 });
      const dupes = [...hardDupes, ...softDupes];

      if (dupes.length === 0) {
        headlines = parsed;
      } else if (attempt < MAX_ATTEMPTS) {
        lastDupes = dupes;
        lastError = `topic dupes on attempt ${attempt}: hard=${hardDupes.length} soft=${softDupes.length}`;
        log(`topic overlap on attempt ${attempt}`, { hardDupes, softDupes });
      } else {
        // Final attempt still clashed — fail closed so we never ship a repeat.
        log('final attempt still had dupes, failing closed', { hardDupes, softDupes });
        lastError = `all ${MAX_ATTEMPTS} attempts had topic overlap (hard=${hardDupes.length} soft=${softDupes.length})`;
      }
    } catch (e) {
      lastError = e.message;
      log(`claude attempt ${attempt} threw`, { error: e.message });
    }
  }

  if (!headlines) {
    return respond(500, { error: 'Failed to generate non-duplicate headlines', detail: lastError, lastDupes });
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

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Topic-dedup helpers ───────────────────────────────────────────────────
// Common words that shouldn't count as distinctive topic signals.
const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','into','over','under','after','before',
  'first','second','third','fourth','fifth','last','final','new','world','year','years',
  'day','days','record','against','between','during','among','wins','win','won','loses',
  'lost','beats','beat','defeats','defeat','claims','claim','becomes','become','about',
  'across','amid','another','historic','crowns','crown','makes','made','takes','took',
  'giant','great','major','epic','huge','massive','return','returns','sets','set','tops',
  'top','captures','capture','seals','seal','sport','sports','news','breaking','announces',
  'announce','million','billion','thousand','more','most','its','their','his','her',
  'north','south','east','west','today','yesterday','nation','nations','country','countries',
  'people','public','story','report','reports','front','page','headline','headlines',
]);

function fingerprint(str) {
  if (!str) return new Set();
  return new Set(
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  );
}

function findTopicDupes(proposedHeadlines, activeFingerprints, opts = {}) {
  const threshold = opts.threshold ?? 2;
  const minLen = opts.minLen ?? 4;
  const dupes = [];
  for (const h of proposedHeadlines) {
    const pKeysAll = fingerprint(
      `${h.eventDescription || ''} ${h.eventKey || ''} ${h.text || ''}`
    );
    // Only consider tokens meeting minLen when checking overlap
    const pKeys = new Set([...pKeysAll].filter((k) => k.length >= minLen));
    if (pKeys.size === 0) continue;
    for (const { event, keywords } of activeFingerprints) {
      const shared = [];
      for (const k of pKeys) if (keywords.has(k) && k.length >= minLen) shared.push(k);
      const keyMatch = h.eventKey && event.eventKey && h.eventKey === event.eventKey;
      if (keyMatch || shared.length >= threshold) {
        dupes.push({
          proposed: h.eventDescription || h.text,
          blocked: event.eventDescription || event.eventKey,
          shared: keyMatch ? ['eventKey'] : shared,
        });
        break; // one match per proposed headline is enough
      }
    }
  }
  return dupes;
}
