// Daily headline generator.
//
// Model: pre-generated per-category queues in Redis. Daily requests just pop
// 1 headline from each of the 5 category queues — no Claude call on the hot
// path. Cron tops queues back up when they get low. First request after deploy
// (or if cron fails for a long stretch) does a synchronous refill.
//
// Keys in Redis:
//   headlines:YYYY-MM-DD   today's 5-item cache (JSON array)
//   queue:<Category>        LIST of pre-generated headline JSON strings
//   used_events             running log of everything ever shown (dedup corpus)
//
// Pass ?debug=1 to include step-by-step diagnostics in the response.

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// Six-category vocabulary (May 2026 — Dad's final list). Daily edition stays
// at 5 questions per day — pickDailyCategoriesForDate rotates which 1 of the
// 6 is skipped each day so all 6 categories cycle through every 6 days.
//
// QUEUE_FALLBACKS bridges legacy queue keys so old pre-generated items still
// flow into the new buckets — nothing pre-generated is wasted. The headlines
// archive (headlines:YYYY-MM-DD) is also bridged via CATEGORY_FILTERS in
// api/practice-headlines.js so the picker reaches all historical data.
export const CATEGORIES = [
  'Sport',
  'Arts & Culture',
  'Politics & World',
  'Disasters & Conflict',
  'Business & Money',
  'Science & Tech',
];

// Per-category editorial briefs, VERBATIM from the original refill prompt. Kept as
// data (not inline) purely so a refill batch can request a SUBSET of categories
// (skipping ones already over-stocked) without touching the wording. Do not edit
// this text — it is the recognisability/quality bar the prompt depends on.
const CATEGORY_BRIEFS = {
  'Sport': "pick moments recognised WELL BEYOND dedicated sports fans, and DELIBERATELY MIX men's and women's sport. Sport skews male in both coverage and audience, so a board of men's-league minutiae quietly locks out half the players. Favour: Olympics (summer & winter), World Cups, barrier-breaking or first-of-its-kind moments (e.g. Billie Jean King's Battle of the Sexes, the first women's Olympic marathon, Jesse Owens in 1936, Nadia Comăneci's perfect 10), globally-followed athletes, era-defining upsets, records, tragedies and controversies. AVOID deep-cut single-country league detail, obscure transfers, and anything only a devoted fan of one men's sport would recognise — those skew the game toward one half of the audience. Every sport pick should be one a well-read non-fan of EITHER gender could plausibly place.",
  'Arts & Culture': "music releases / chart-toppers / tours, film (Oscars, premieres, box office), TV (finales, premieres, ratings hits), celebrity moments, royalty (weddings, deaths, coronations), fashion, art, books, awards, theatre",
  'Politics & World': "elections, leaders taking/leaving office, treaties, summits, sovereignty changes, peace deals, diplomatic milestones, political scandals, referendums",
  'Disasters & Conflict': "wars (declarations, key battles, ends), terrorism, natural disasters, industrial disasters, revolutions, dramatic violent events",
  'Business & Money': "stock market crashes, corporate sagas, economic crises, financial scandals, major mergers, IPOs, bankruptcies, currency events",
  'Science & Tech': "discoveries, inventions, space, medicine, aviation milestones, computing/internet milestones",
};

// When pulling from a category queue, also try these legacy queue keys in
// order. Lets us drain pre-generated items from the older naming schemes
// without losing any pre-generated content.
const QUEUE_FALLBACKS = {
  'Sport':                ['Sport'],
  'Arts & Culture':       ['Arts & Culture', 'Pop Culture'],
  'Politics & World':     ['Politics & World', 'World Events', 'Politics/World Events'],
  'Disasters & Conflict': ['Disasters & Conflict', 'Crime & Disasters', 'Crime/Scandal/Disaster'],
  'Business & Money':     ['Business & Money'],
  'Science & Tech':       ['Science & Tech', 'Tech & Science', 'Science/Tech'],
};

// Headlines rule: 5 questions per day, always. We show 5 of the 6 categories
// each day (one is skipped). Sport is skipped MORE often than the others —
// players felt sport featured too much and it skews to ~half the audience — so
// Sport appears ~4 days a week instead of ~6, with the freed slots going to the
// broader-appeal categories. Deterministic by date so everyone gets the same
// edition (leaderboards stay comparable).
const DAILY_CATEGORY_COUNT = 5;
function pickDailyCategoriesForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000);
  // Sport is CATEGORIES[0]. On 3 of every 7 days, Sport is the skipped category;
  // on the other 4 days the skip rotates among the five non-sport categories.
  const mod7 = ((dayOfYear % 7) + 7) % 7;
  let skipIdx;
  if (mod7 === 0 || mod7 === 3 || mod7 === 5) {
    skipIdx = 0; // skip Sport
  } else {
    const others = [1, 2, 3, 4, 5];
    skipIdx = others[((dayOfYear % others.length) + others.length) % others.length];
  }
  const selected = CATEGORIES.filter((_, i) => i !== skipIdx);
  // Shuffle deterministically by date so each day's 5 categories appear in a
  // different order — previously the fixed CATEGORIES order meant Sport was
  // Q1 on ~5 days out of 6. Same date → same order for everyone, so leaderboards
  // stay comparable. Affects only future pops; already-cached editions
  // (today + the pre-warmed window) keep the order they were stored with.
  return seededShuffle(selected, d.getUTCFullYear() * 1000 + dayOfYear);
}

// Deterministic Fisher–Yates shuffle using a Mulberry32 PRNG. Same seed →
// same permutation. Self-contained; used only by pickDailyCategoriesForDate.
function seededShuffle(arr, seed) {
  const out = arr.slice();
  let s = seed >>> 0;
  function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Fuzzy duplicate detection ────────────────────────────────────────────────
// The model is unreliable about honouring the avoid-list and about reusing the
// same `eventKey` for the same real-world event (it invents fresh slugs every
// call). Exact-key dedup misses every relabelled repeat. We catch them
// server-side using significant-token overlap + year proximity. Stop list
// removes filler that's common across unrelated headlines so it doesn't drive
// false matches.
const FUZZY_STOP_TOKENS = new Set([
  'with','that','this','into','from','over','said','says','also','than','then',
  'they','their','what','when','where','about','again','more','most','very','just',
  'after','before','during','within','because','since','until','while','amid',
  'becomes','biggest','greatest','first','second','third','last','final','today',
  'declared','declares','crowned','wins','beats','shocks','stunned','dazzles',
  'triumph','glory','great','record','records','historic','famous','legendary',
  'dramatic','tragic','years','year','decade','century','ever','event','events',
  'story','stories','headline','headlines','despite','among','across','around',
  'near','only','still','already','crisis','scandal','launches','launched',
  'named','names','reveals','revealed','reports','report','british','american',
  'french','german','global','modern','ancient',
]);
function fuzzyTokens(s) {
  if (typeof s !== 'string') return new Set();
  const out = new Set();
  for (const t of (s.toLowerCase().match(/[a-z]{4,}/g) || [])) {
    if (FUZZY_STOP_TOKENS.has(t)) continue;
    // Crude singularisation — strip trailing 's' on tokens 5+ chars so
    // "falklands"/"falkland" and "olympics"/"olympic" merge into one signal.
    const norm = t.length >= 5 && t.endsWith('s') ? t.slice(0, -1) : t;
    out.add(norm);
  }
  return out;
}
function avoidEntry(item) {
  // Token bag pulls from description + text + eventKey slug. Including the
  // slug catches cases where the description is terse (e.g. "Apollo 11 moon
  // landing") but the slug is rich (e.g. "neil-armstrong-moonwalk-1969") —
  // otherwise a new candidate using different wording for the same event
  // shares too few tokens to match.
  const slugWords = (item?.eventKey || '').replace(/[-_]/g, ' ');
  const blob = (item?.eventDescription || '') + ' ' + (item?.text || '') + ' ' + slugWords;
  return { year: typeof item?.year === 'number' ? item.year : null, tokens: fuzzyTokens(blob) };
}
// ── Topic-level signatures ────────────────────────────────────────────────
// Recurring high-recognisability themes that the model returns over and over
// with different wording, different years, and freshly-invented eventKeys. The
// fuzzy token check can miss these when two tellings share <2 words (e.g.
// "Indian Ocean tsunami" vs "Boxing Day waves strike Asia"). Each signature
// collapses all its phrasings into ONE topic so we can cap it at 1 per the
// 365-day window — the product rule "no second tsunami / moon-landing / Berlin
// Wall within a year, even if it's technically a different event or year".
// Match against text + eventDescription + eventKey (lowercased).
const TOPIC_SIGNATURES = [
  ['tsunami',          /\btsunami\b/],
  ['great-earthquake', /\bearthquake|\bquake\b/],
  ['moon-landing',     /\bmoon landing|\bapollo 1[13]\b|first man on the moon|lunar landing|walk(?:ed|s)? on the moon|giant leap/],
  ['titanic',          /\btitanic\b/],
  ['berlin-wall',      /\bberlin wall|fall of the wall|wall that divided|tear down (?:this|the) wall/],
  ['mandela',          /\bmandela\b/],
  ['tour-de-france',   /\btour de france\b/],
  ['jfk-assassination',/kennedy assassinat|jfk (?:is )?shot|kennedy (?:is )?shot|dallas.*kennedy|kennedy.*dallas|kennedy.*motorcade/],
  ['princess-diana',   /princess diana|diana.*(?:paris|crash|tunnel|dead|dies|killed)|death of diana/],
  ['chernobyl',        /\bchernobyl\b/],
  ['september-11',     /\b9\/11\b|september 11|twin towers|world trade cent/],
  ['hindenburg',       /\bhindenburg\b/],
  ['space-shuttle-disaster', /challenger.*(?:shuttle|explo|disaster)|shuttle.*(?:explo|disaster)|columbia.*(?:shuttle|disaster|disinteg)/],
  ['elvis-death',      /elvis.*(?:dead|dies|found|graceland)|death of elvis|king of rock.*dead/],
  ['saigon-fall',      /\bsaigon\b/],
  ['concorde',         /\bconcorde\b/],
  ['comaneci-perfect', /comaneci|perfect (?:10|ten)|first perfect score/],
  ['babe-ruth',        /babe ruth|\bruth\b.*(?:home run|yankee|bat|baseball)|(?:home run|yankee|bat|baseball).*\bruth\b/],
  ['kasparov-deep-blue', /deep blue|kasparov/],
  ['hiroshima-bomb',   /hiroshima|nagasaki|atomic bomb drop/],
  ['hindenburg-zeppelin', /\bzeppelin\b/],
];
function topicOf(item) {
  const blob = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    String(item?.eventKey || '').replace(/[-_]/g, ' ')
  ).toLowerCase();
  for (const [name, re] of TOPIC_SIGNATURES) if (re.test(blob)) return name;
  return null;
}

const TOPIC_CAP = 1; // max events per topic signature in the 365-day window

// Build a stateful duplicate matcher over a corpus of prior events. Encapsulates
// four independent guards, strongest-first:
//   1. exact eventKey already seen         → 'exact-key'
//   2. topic signature already at cap       → 'topic:<name>'
//   3. ≥3 shared tokens, or ≥2 with year ±5 → 'overlap3' / 'overlap2yr'
// A df-based "distinctive single token" guard was prototyped and rejected: in a
// few-hundred-event corpus it false-positived heavily (Suez⟂Panama on
// {canal,waterway}, Katrina⟂SF-quake on {thousand,city}), so topic-level dedup
// is delivered through the curated TOPIC_SIGNATURES list instead — precise and
// extensible. See scripts/sim-dedup2.mjs for the data behind that call.
// `add()` folds an accepted item back into the corpus so within-batch and
// within-edition duplicates are blocked too (mutating, call after acceptance).
// check() returns a short reason string when blocked, otherwise null.
function createAvoidMatcher(entries) {
  const index = [];                 // [{year, tokens}]
  const keys = new Set();           // eventKeys seen
  const topicCounts = new Map();    // topic name → count
  function fold(item) {
    if (item?.eventKey) keys.add(item.eventKey);
    const tp = topicOf(item);
    if (tp) topicCounts.set(tp, (topicCounts.get(tp) || 0) + 1);
    const ae = avoidEntry(item);
    if (ae.tokens.size) index.push(ae);
  }
  for (const e of entries) fold(e);

  return {
    check(candidate) {
      if (candidate?.eventKey && keys.has(candidate.eventKey)) return 'exact-key';
      const tp = topicOf(candidate);
      if (tp && (topicCounts.get(tp) || 0) >= TOPIC_CAP) return `topic:${tp}`;
      const c = avoidEntry(candidate);
      if (c.tokens.size === 0) return null;
      for (const u of index) {
        if (!u.tokens.size) continue;
        let overlap = 0;
        for (const t of c.tokens) if (u.tokens.has(t)) overlap++;
        if (overlap >= 3) return 'overlap3';
        if (overlap >= 2 && typeof c.year === 'number' && typeof u.year === 'number' && Math.abs(c.year - u.year) <= 5) return 'overlap2yr';
      }
      return null;
    },
    add(candidate) { fold(candidate); },
    stats() { return { corpus: index.length, topics: topicCounts.size }; },
  };
}

const REFILL_THRESHOLD = 3;    // refill when any queue drops below this
// A refill is a paid Claude batch (~$0.20). Bound how often ANY caller can
// trigger one — the scheduled cron refill AND dailyPop's emergency refill.
const REFILL_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~once per day
const PER_CATEGORY_TARGET = 10; // each refill adds ~this many per category
// Cost control: a refill batch skips categories already this well-stocked, so we
// don't pay to over-generate Arts/Business (which pile up) while still topping up
// the thin ones. NEVER skip THIN_CATEGORIES — those are supply-limited and rely
// on every batch's trickle to stay above empty. The avoid-list still spans ALL
// queues regardless, so skipping a category can't cause a duplicate.
const CATEGORY_CEILING = 25; // > this many already queued → omit from the batch
const THIN_CATEGORIES = ['Disasters & Conflict', 'Science & Tech'];
// Two windows on purpose: the SERVER enforces 365-day dedup (the actual product
// rule "no repeats unless over 1 year ago"), while the PROMPT shows the model
// only the most recent ~60 days. Showing the model the full 365-day list
// (340+ events) overwhelms it — it ends up regenerating the same famous events
// because it can't keep that many constraints in mind. Server-side fuzzy
// validation catches anything in the longer window that the model proposes.
const USED_WINDOW_DAYS = 365;   // server-side fuzzy enforcement window
const USED_WINDOW_MS = USED_WINDOW_DAYS * 86_400_000;
const PROMPT_AVOID_DAYS = 30;   // how much of the used list the model SEES up front. Kept at 30 on purpose: the app is <120 days old, so a larger window dumps nearly the whole history on the model and overwhelms it (yield dropped sharply when tried at 120). Server-side dedup still enforces the full 365-day window regardless.
const PROMPT_AVOID_MS = PROMPT_AVOID_DAYS * 86_400_000;

// Claude pricing for the refill model (USD per 1M tokens). Update these if
// the model changes. Used to populate the admin budget card.
const MODEL = 'claude-sonnet-4-6';
const INPUT_USD_PER_M = 3;
const OUTPUT_USD_PER_M = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const debug = req.query?.debug === '1';
  const steps = [];
  const log = (msg, data) => steps.push(data ? { msg, ...data } : { msg });
  const respond = (status, body) =>
    res.status(status).json(debug ? { ...body, debug: { steps } } : body);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return respond(500, { error: 'Redis env vars missing' });
  }

  const clientDate = req.body?.date;
  const today = isValidDate(clientDate)
    ? clientDate
    : new Date().toISOString().split('T')[0];

  try {
    const result = await dailyPop(today, log);
    return respond(200, result);
  } catch (e) {
    log('dailyPop threw', { error: e.message });
    return respond(500, { error: e.message });
  }
}

// Cricket is functionally unrecognisable to American players. The new prompt
// bans cricket entries explicitly but the model historically ignores soft
// limits, so we hard-reject any cricket-flavoured item server-side.
function isCricketRelated(item) {
  const t = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    (item?.eventKey || '')
  ).toLowerCase();
  return /\b(cricket|bradman|wisden|the ashes|ashes series|test match|tests at|wicket|wickets|batsman|batsmen|bowler|bowled|county cricket|ipl |t20 |sheffield shield|cricket world cup|long room|lords cricket|mcc|baggy green)\b/.test(t);
}

// Baseball is the American mirror of cricket — culturally huge in the US,
// functionally meaningless to British players (who are a big chunk of the
// audience). The game already hard-bans cricket for the same reason; this
// keeps it symmetric. American football / NFL falls in the same bucket.
// Hard-rejected at BOTH generation and serving so existing queued items are
// skipped too. (Genuinely global sport — football, Olympics, tennis, F1,
// boxing — is unaffected.)
function isNicheNationalSport(item) {
  const t = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    (item?.eventKey || '')
  ).toLowerCase();
  return /\b(baseball|home run|home-run|world series|major league|mlb|yankees|red sox|dodgers|babe ruth|joe dimaggio|lou gehrig|hank aaron|world cup of baseball|grand slam home|n\.?f\.?l\.?|super bowl|touchdown|quarterback|gridiron|nfl draft|ice hockey|\bhockey\b|stanley cup|\bnhl\b|\bpuck\b|wanderers|thistles|basketball|\bnba\b|slam dunk|\bncaa\b|\brugby\b|six nations|all blacks|\bhaka\b|bledisloe|heineken cup|rugby league|rugby union|aussie rules|\bafl\b|gaelic football|hurling)\b/.test(t);
}

// US-centric detector. The model's "famous events" pool skews heavily American,
// which non-US players (UK/AU/EU — the core audience) flag as too US-focused.
// Used as a per-batch density cap so US events are present but don't dominate.
// Best-effort by keyword; the goal is balance, not perfect classification.
function isUSCentric(item) {
  const t = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    (item?.eventKey || '')
  ).toLowerCase();
  return /\b(america|american|u\.?s\.?a?\b|united states|washington|new york|white house|congress|senator|nasa|wall street|hollywood|pentagon|\bfbi\b|\bcia\b|silicon valley|california|texas|florida|chicago|boston|las vegas|kentucky|nixon|kennedy|reagan|obama|trump|clinton|eisenhower|truman|roosevelt|woodstock|watergate|disneyland|coca-cola|microsoft|google|facebook|amazon|tesla|boeing|enron|lehman|dow jones|nasdaq|hurricane katrina|9\/11|twin towers|world trade center|pearl harbor|apollo 1[13]|civil rights|martin luther king|rosa parks|jfk|roe v wade|prohibition|dust bowl|gold rush)\b/.test(t);
}

// PERMANENT_BANNED_TOPICS (defined below) are listed in the prompt, but the
// model ignores soft limits — so hard-reject them server-side at BOTH generation
// and serving, exactly like the sport bans, including any pre-existing queued
// items that predate the ban. Currently: the IVF / test-tube baby / Louise Brown
// milestone (a standing editorial ban — see feedback_no_ivf_headlines).
function isPermanentlyBanned(item) {
  const t = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    (item?.eventKey || '')
  ).toLowerCase();
  return /\blouise brown\b|test[-\s]?tube bab(?:y|ies)|\bivf\b|\bin[-\s]?vitro\b/.test(t);
}

// WWII/Holocaust events cluster heavily in the model's "famous events" pool
// (Dunkirk, Pearl Harbor, D-Day, Hiroshima, V-E Day, Japan surrenders…). The
// fuzzy dedup treats each as a distinct event, so without an explicit density
// rule the archive ends up dominated by WWII headlines. This identifier is
// used both in the prompt as a soft limit AND server-side as a hard cap (max
// 1 WWII-related item per refill batch).
function isWWIIRelated(item) {
  const t = (
    (item?.text || '') + ' ' +
    (item?.eventDescription || '') + ' ' +
    (item?.eventKey || '')
  ).toLowerCase();
  if (/world war|wwii|ww2|holocaust|hitler|nazi|pearl harbor|d-?day|normandy|dunkirk|hiroshima|nagasaki|atomic bomb|japan surrenders|v[- ]?e day|v[- ]?j day|battle of britain|the blitz|stalingrad|axis powers|auschwitz|enigma machine|allied invasion/.test(t)) return true;
  const y = typeof item?.year === 'number' ? item.year : null;
  if (y && y >= 1939 && y <= 1945 && /(churchill|roosevelt|stalin|surrender|allied|axis|war ends)/.test(t)) return true;
  return false;
}

// Reject obvious placeholder / test / corrupt entries before they reach a
// player. Real headlines are long sentences with a real publication name and
// a plausible year. Defends against any path — old queue items, manual test
// data, malformed model output — that could otherwise serve `placeholder` or
// similar as today's question.
export function isValidHeadline(h) {
  if (!h || typeof h !== 'object') return false;
  if (typeof h.text !== 'string' || h.text.trim().length < 20) return false;
  // Bound to the player's slider range (1900–2026) so an out-of-range event
  // can't end up in a daily edition where the player literally can't slide to
  // the correct year.
  if (typeof h.year !== 'number' || h.year < 1900 || h.year > 2026) return false;
  if (typeof h.publication !== 'string' || h.publication.trim().length < 3) return false;
  const bad = /^\s*(placeholder|test|todo|tbd|fixme|sample|example|none|null|undefined|n\/a|xxx)\s*$/i;
  if (bad.test(h.text) || bad.test(h.publication)) return false;
  return true;
}

// ── Core flow: cache → queue pop → (emergency refill) → cache write ───────
// "The rest of the front page" hint: for each headline, attach a `hint` — the
// text of ANOTHER real headline from the pool within ±2 years (a different
// event, preferably a different category). Zero LLM: it just reuses headlines
// we already generated. Headlines with no same-era neighbour in the pool get no
// hint, and the client simply hides the hint button for them.
function attachPoolHints(headlines, pool) {
  if (!Array.isArray(pool) || !pool.length) return;
  const used = new Set(headlines.map((h) => (h.text || '').toUpperCase()));
  for (const h of headlines) {
    if (h.hint || typeof h.year !== 'number') continue;
    const cands = pool.filter(
      (e) => e && e.text && typeof e.year === 'number'
        && Math.abs(e.year - h.year) <= 2
        && !used.has(e.text.toUpperCase())
    );
    if (!cands.length) continue;
    // Closest year first; then prefer a different category; deterministic so the
    // same edition always yields the same clue.
    cands.sort((a, b) => {
      const dy = Math.abs(a.year - h.year) - Math.abs(b.year - h.year);
      if (dy !== 0) return dy;
      const ca = a.category === h.category ? 1 : 0;
      const cb = b.category === h.category ? 1 : 0;
      if (ca !== cb) return ca - cb;
      return (a.text || '').localeCompare(b.text || '');
    });
    h.hint = cands[0].text;
    used.add(h.hint.toUpperCase()); // don't reuse the same clue twice in one edition
  }
}

export async function dailyPop(date, log) {
  const cacheKey = `headlines:${date}`;

  const cached = await kvGet(cacheKey, log);
  if (Array.isArray(cached) && cached.length === DAILY_CATEGORY_COUNT && cached.every(isValidHeadline)) {
    log?.('cache hit', { date });
    // Serve-time hint enrichment. Editions cached before hints existed (or with a
    // headline whose clue is still missing) get "rest of the front page" clues
    // attached IN MEMORY from the pool. We never write back — headlines:* stays
    // immutable (load-bearing for Practice Mode) — and we only pay the pool read
    // when a hint is actually missing, so hint-carrying editions cost nothing.
    try {
      if (cached.some((h) => !h.hint)) {
        attachPoolHints(cached, toArray(await kvGet('used_events', log)));
      }
    } catch (e) {
      // Hints are a nice-to-have — never let enrichment break the daily serve.
      log?.('hint enrich failed', { error: e.message });
    }
    return { headlines: cached, source: 'cache' };
  }
  if (Array.isArray(cached) && cached.length === DAILY_CATEGORY_COUNT) {
    log?.('cache had invalid items — regenerating', { date, invalid: cached.filter(h => !isValidHeadline(h)).length });
  }

  // Choose which 5 of the 6 categories appear in today's edition.
  // Deterministic by date so all players get the same edition.
  const todaysCategories = pickDailyCategoriesForDate(date);
  log?.('todays categories', { date, categories: todaysCategories });

  // Build the avoid matcher from the last 365 days of used events. Passed into
  // pop so duplicate items in the queue (relabelled repeats from earlier
  // refills, or exact-key repeats) are skipped at draw time instead of being
  // served to players.
  const usedRawForPop = await kvGet('used_events', log);
  const recentForPop = toArray(usedRawForPop).filter(
    (e) => typeof e?.addedAt === 'number' && e.addedAt >= Date.now() - USED_WINDOW_MS
  );
  const matcher = createAvoidMatcher(recentForPop);

  let popped = await popOnePerCategoryWithFallback(todaysCategories, log, matcher);
  const missing = todaysCategories.filter((_, i) => !popped[i]);

  if (missing.length > 0) {
    log?.('queues missing items — running emergency refill', { missing });
    const refill = await refillQueues(log);
    log?.('emergency refill done', refill);
    // put anything we DID get back at the head so they aren't lost
    const putBack = [];
    for (let i = 0; i < todaysCategories.length; i++) {
      if (popped[i]) putBack.push(['LPUSH', queueKey(todaysCategories[i]), JSON.stringify(popped[i])]);
    }
    if (putBack.length) await kvPipeline(putBack, log);
    popped = await popOnePerCategoryWithFallback(todaysCategories, log, createAvoidMatcher(recentForPop));
  }

  let stillMissing = todaysCategories.filter((_, i) => !popped[i]);
  if (stillMissing.length > 0) {
    // Graceful fallback: rather than failing the whole edition when a category
    // can't yield a valid, global, non-duplicate headline (most likely Sport,
    // now that niche/country-only sports are skipped at serve time), fill the
    // empty slot from the SPARE 6th category — the one skipped today. The player
    // still gets 5 questions, never a banned item, and the day never errors. The
    // edition is cached on first generation, so all players still get the same 5.
    // Fill each empty slot from a category that is NOT already on today's
    // board, so we never serve two headlines of the same category on one day.
    // The skipped 6th ("spare") category is the natural first choice; if a
    // SECOND slot also needs filling (or the spare's queue is dry), fall
    // through to any other not-yet-present category rather than doubling up.
    const spare = CATEGORIES.find((c) => !todaysCategories.includes(c));
    const fillMatcher = createAvoidMatcher(recentForPop);
    const presentCats = new Set();
    const spareSubs = []; // record each substitution so the cron can alert on drift
    for (const it of popped) if (it) { fillMatcher.add(it); if (it.category) presentCats.add(it.category); }
    for (let i = 0; i < todaysCategories.length; i++) {
      if (popped[i]) continue;
      // Candidate fill categories, in priority order: the spare first, then any
      // other category — each excluded once it's already on the board (which
      // includes slots we filled earlier in this same loop). Sport is forced to
      // LAST regardless of where it lands above: it's already throttled to ~4
      // days in 7 by the serve-time gate, and letting it jump into spare slots
      // would quietly undo that throttle and over-serve Sport. Only reach for a
      // Sport substitute when literally nothing else can fill the slot.
      const candidates = [spare, ...CATEGORIES]
        .filter((c, idx, a) => c && !presentCats.has(c) && a.indexOf(c) === idx)
        .sort((a, b) => (a === 'Sport' ? 1 : 0) - (b === 'Sport' ? 1 : 0));
      for (const cand of candidates) {
        const [fillItem] = await popOnePerCategoryWithFallback([cand], log, fillMatcher);
        if (fillItem) {
          popped[i] = fillItem;
          const filledFrom = fillItem.category || cand;
          presentCats.add(filledFrom);
          // Only record a GENUINE substitution — i.e. the slot for one category
          // was filled from a DIFFERENT category. If the wanted category itself
          // yielded on retry (filledFrom === wanted) that's a normal pop, not a
          // fallback, and must not inflate the spare-sub alert metric.
          if (filledFrom !== todaysCategories[i]) {
            spareSubs.push({ date, slot: i, wanted: todaysCategories[i], filledFrom });
          }
          log?.('filled empty slot from alternate category', { slot: i, wanted: todaysCategories[i], filledFrom });
          break;
        }
      }
    }
    stillMissing = todaysCategories.filter((_, i) => !popped[i]);

    if (spareSubs.length) {
      // Record spare-substitution events so the cron can alert if we're leaning
      // on the fallback too often — a rising rate means a category is drying up
      // and content is at risk of repeating. Best-effort; never break serving.
      try {
        const stamp = Date.now();
        const cmds = spareSubs.map((s) => ['LPUSH', 'usage:spare_subs', JSON.stringify({ ts: stamp, ...s })]);
        cmds.push(['LTRIM', 'usage:spare_subs', '0', '499']);
        await kvPipeline(cmds, log);
      } catch (e) {
        log?.('spare-sub record failed', { error: e.message });
      }
    }
  }

  if (stillMissing.length > 0) {
    throw new Error(`queues empty after refill + spare: ${stillMissing.join(', ')}`);
  }

  const headlines = popped.map((item, i) => ({
    id: `ai_${date}_${i + 1}`,
    text: item.text,
    year: item.year,
    publication: item.publication,
    pubColor: item.pubColor || '#1a1a1a',
    context: item.context || '',
    category: item.category || todaysCategories[i],
  }));

  // Attach "rest of the front page" hints from the existing pool (zero LLM).
  // Done before caching so the edition carries its clues and serving is free.
  attachPoolHints(headlines, toArray(usedRawForPop));

  const now = Date.now();
  const used = toArray(await kvGet('used_events', log));
  const newEntries = popped.map((item) => ({
    eventKey: item.eventKey,
    eventDescription: item.eventDescription,
    // Store the full headline text so the dedup fingerprint for this event is
    // rich (not just the terse description + slug). Without it, the same event
    // reworded later shares too few tokens and slips the fuzzy check — which is
    // exactly how the 2004 tsunami got served twice 19 days apart.
    text: item.text,
    year: item.year,
    category: item.category,
    addedAt: now,
  }));

  await Promise.all([
    kvSet(cacheKey, headlines, log),
    kvSet('used_events', [...used, ...newEntries], log),
  ]);

  log?.('popped + cached', { date, categories: popped.map((p) => p.category) });
  return { headlines, source: 'queue' };
}

// Pop one item per requested category, trying legacy queue names as fallback
// so pre-generated items under older category names are still drained.
// Invalid items (placeholders, malformed) and duplicates of recently-used
// events are discarded — we keep popping from the same queue up to MAX_SKIPS
// times before moving on. The `matcher` is mutated as items are accepted so
// within-edition duplicates are also blocked (e.g. two Titanic events in one
// day even if neither matched the historical avoid list).
async function popOnePerCategoryWithFallback(categories, log, matcher = createAvoidMatcher([])) {
  const MAX_SKIPS = 8;
  const results = [];
  for (const cat of categories) {
    const fallbacks = QUEUE_FALLBACKS[cat] || [cat];
    let item = null;
    for (const name of fallbacks) {
      for (let attempt = 0; attempt < MAX_SKIPS; attempt++) {
        const r = await kvPipeline([['LPOP', queueKey(name)]], log);
        const raw = r?.[0]?.result;
        if (!raw) break; // queue empty — try next fallback name
        const parsed = parseJSON(raw);
        if (!parsed || !isValidHeadline(parsed)) {
          log?.('discarded invalid queue item', { queue: name, sample: typeof raw === 'string' ? raw.slice(0, 80) : null });
          continue;
        }
        if (isNicheNationalSport(parsed) || isCricketRelated(parsed)) {
          log?.('skipped country-only sport at pop', { queue: name, text: (parsed.text || '').slice(0, 60) });
          continue;
        }
        if (isPermanentlyBanned(parsed)) {
          log?.('skipped permanently-banned topic at pop', { queue: name, text: (parsed.text || '').slice(0, 60) });
          continue;
        }
        const dupReason = matcher.check(parsed);
        if (dupReason) {
          log?.('skipped duplicate queue item', { queue: name, reason: dupReason, eventKey: parsed.eventKey, year: parsed.year, desc: (parsed.eventDescription || '').slice(0, 60) });
          continue;
        }
        item = parsed;
        matcher.add(parsed);
        if (name !== cat) {
          log?.('used legacy queue fallback', { wanted: cat, popped_from: name });
        }
        break;
      }
      if (item) break;
    }
    results.push(item);
  }
  return results;
}

// ── Refill: one Claude call → bucket into category queues ─────────────────
export async function refillQueues(log, { dryRun = false, force = false } = {}) {
  // GLOBAL cost cap. A refill is a paid Claude call, so bound how often ANY
  // caller can trigger one: the cron's scheduled refill AND — critically —
  // dailyPop's emergency refill, which the cron's hourly pre-warm was firing
  // uncapped (the real leak). Skip if we refilled within REFILL_MIN_INTERVAL,
  // unless forced/dryRun. Availability is unaffected: dailyPop always yields a
  // valid 5-headline edition via the spare-category fallback even if a queue is
  // empty between refills.
  //
  // force=true is the DELIBERATE MANUAL LEVER (`?force=1` on the cron): it
  // bypasses BOTH the demand-driven trigger (in runMaintenance) AND this 20h
  // cost cap, forcing a paid batch immediately. That's intentional — it's how a
  // human restocks empty queues on demand (e.g. bridging a content gap). It is
  // NOT reachable by any automated path, so it can't cause a runaway on its own.
  if (!dryRun && !force) {
    const last = Number(await kvGet('usage:last_refill_at', log)) || 0;
    if (Date.now() - last < REFILL_MIN_INTERVAL_MS) {
      log?.('refill skipped — within cost-cap interval', { hoursSinceLast: ((Date.now() - last) / 3.6e6).toFixed(1) });
      return { skipped: true, reason: 'cost-cap' };
    }
    // Claim the slot up front so a slow/failed refill can't be retried in a loop.
    await kvSet('usage:last_refill_at', Date.now(), log);
  }
  const [usedRaw, pendingByCat] = await Promise.all([
    kvGet('used_events', log),
    readQueues(log),
  ]);

  const usedEvents = toArray(usedRaw);
  const cutoff = Date.now() - USED_WINDOW_MS;
  const recentUsed = usedEvents.filter(
    (e) => typeof e?.addedAt === 'number' && e.addedAt >= cutoff
  );
  // Smaller window for what the model sees — full 365-day enforcement still
  // happens server-side via the avoid matcher below.
  const promptCutoff = Date.now() - PROMPT_AVOID_MS;
  const promptRecent = usedEvents.filter(
    (e) => typeof e?.addedAt === 'number' && e.addedAt >= promptCutoff
  );
  const pending = pendingByCat.flat();

  const avoidDescriptions = [
    ...promptRecent.map((e) => e?.eventDescription).filter(Boolean),
    ...pending.map((p) => p?.eventDescription).filter(Boolean),
  ];

  // Player "too obscure?" flags → negative examples for the prompt, so the model
  // learns what plays as unfair and avoids that flavour of niche pick.
  const obscureExamples = await readObscureExamples(log);

  const target = PER_CATEGORY_TARGET;
  // Request only categories that actually need topping up. Over-stocked ones
  // (> CATEGORY_CEILING queued) are omitted to cut output tokens; thin ones are
  // always requested so their trickle never stops. Dedup is unaffected — the
  // avoid list below is built from ALL queues, not just the requested ones.
  const queueLens = await queueLengths(log);
  const requestedCategories = CATEGORIES.filter(
    (c) => THIN_CATEGORIES.includes(c) || (queueLens[c] ?? 0) <= CATEGORY_CEILING
  );
  const totalRequested = target * requestedCategories.length;

  // Build a (decade x overall) distribution of used events so the prompt can
  // steer the model toward under-represented eras. Computed across the full
  // 365-day window — that's the pool the dedup actually enforces.
  const eras = ['1900-1919','1920-1939','1940-1959','1960-1979','1980-1999','2000-2024'];
  const eraOf = (y) => {
    if (typeof y !== 'number') return null;
    if (y < 1920) return '1900-1919';
    if (y < 1940) return '1920-1939';
    if (y < 1960) return '1940-1959';
    if (y < 1980) return '1960-1979';
    if (y < 2000) return '1980-1999';
    return '2000-2024';
  };
  const eraCounts = Object.fromEntries(eras.map((e) => [e, 0]));
  for (const ev of recentUsed) {
    const e = eraOf(ev?.year);
    if (e) eraCounts[e]++;
  }
  const distribution = { eras: eraCounts, totalUsed: recentUsed.length };

  const prompt = buildRefillPrompt({ target, totalRequested, categories: requestedCategories, avoidDescriptions, distribution, obscureExamples });
  log?.('refill batch categories', { requested: requestedCategories, skipped: CATEGORIES.filter((c) => !requestedCategories.includes(c)), queueLens });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 24000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  log?.('claude refill response', { status: response.status });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`claude http ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const usage = data.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cost = (inputTokens * INPUT_USD_PER_M + outputTokens * OUTPUT_USD_PER_M) / 1_000_000;
  // Record spend even if parse fails below, so we capture every billed call.
  await kvPipeline([
    ['RPUSH', 'usage:refills', JSON.stringify({
      ts: Date.now(),
      model: MODEL,
      input: inputTokens,
      output: outputTokens,
      cost,
    })],
  ], log);
  log?.('refill usage recorded', { inputTokens, outputTokens, cost });

  const items = extractJsonArray(text);
  if (!Array.isArray(items)) {
    throw new Error('claude did not return a JSON array');
  }

  const buckets = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  // Avoid matcher over recent used events + everything pending in queues. Topic
  // signatures and exact-key both work on the terse used_events entries, so the
  // full shown-history is covered for those guards without re-reading the
  // archive (enriching with the full-text archive was measured to collapse
  // generation yield — the model re-proposes famous events that overlap the
  // year's pool, and almost nothing survives). used_events now stores full text
  // going forward, so the overlap guard sharpens over time on its own.
  const matcher = createAvoidMatcher([...recentUsed, ...pending]);
  let kept = 0;
  let skippedShape = 0;
  let skippedDup = 0;
  let skippedFuzzy = 0;
  let skippedTopicCap = 0;
  // Hard cap: 1 WWII / wartime item per refill batch — so many distinct events
  // meet the bar that the archive gets dominated otherwise. (Cricket and other
  // country-only sports are hard-banned above, not capped.)
  let wwiiCount = 0;
  // US-density cap: non-US players (UK/AU/EU) flagged the board as too US-focused.
  // Allow US events but cap them at ~45% of a batch so the rest of the world gets
  // fair representation. Tunable — raise if categories start starving.
  let usCount = 0;
  const US_CAP = Math.round(totalRequested * 0.45);

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') { skippedShape++; continue; }
    if (!CATEGORIES.includes(raw.category)) { skippedShape++; continue; }
    if (!raw.eventKey || !raw.text || typeof raw.year !== 'number') { skippedShape++; continue; }
    // Defence in depth — reject placeholder / test-looking entries here so
    // they never reach the queue in the first place.
    if (!isValidHeadline(raw)) { skippedShape++; continue; }
    // Hard-ban country-only sports — baseball, NFL, hockey, NBA, rugby (niche)
    // AND cricket. Sport must be globally followed; if it isn't, drop it.
    if (isNicheNationalSport(raw) || isCricketRelated(raw)) { skippedShape++; continue; }
    // Hard-ban permanent editorial bans (IVF / test-tube baby) — the prompt asks,
    // but the model ignores soft limits, so enforce it here too.
    if (isPermanentlyBanned(raw)) { skippedShape++; continue; }
    // Single guard for exact-key / topic-cap / fuzzy / distinctive-token
    // repeats against the 365-day corpus + this batch so far.
    const dupReason = matcher.check(raw);
    if (dupReason) {
      if (dupReason === 'exact-key') skippedDup++;
      else if (dupReason.startsWith('topic:')) skippedTopicCap++;
      else skippedFuzzy++;
      log?.('refill skipped duplicate', { reason: dupReason, eventKey: raw.eventKey, year: raw.year, text: String(raw.text).slice(0, 60) });
      continue;
    }
    // Topic density: WWII cap. First WWII item passes, any further ones in
    // this batch get rejected to keep the archive globally diverse.
    if (isWWIIRelated(raw)) {
      if (wwiiCount >= 1) { skippedTopicCap++; continue; }
      wwiiCount++;
    }
    // Geographic balance: cap US-centric items per batch so the board isn't
    // dominated by American events.
    if (isUSCentric(raw)) {
      if (usCount >= US_CAP) { skippedTopicCap++; continue; }
      usCount++;
    }
    matcher.add(raw);
    buckets[raw.category].push({
      eventKey: String(raw.eventKey).slice(0, 80),
      eventDescription: String(raw.eventDescription || raw.text).slice(0, 200),
      category: raw.category,
      text: String(raw.text),
      year: raw.year,
      publication: String(raw.publication || 'The Times'),
      pubColor: String(raw.pubColor || '#1a1a1a'),
      context: String(raw.context || ''),
    });
    kept++;
  }

  const rpushCmds = [];
  for (const cat of CATEGORIES) {
    const list = buckets[cat];
    if (list.length === 0) continue;
    rpushCmds.push(['RPUSH', queueKey(cat), ...list.map((x) => JSON.stringify(x))]);
  }

  if (rpushCmds.length === 0) {
    if (dryRun) {
      log?.('dryRun refill produced no valid items', { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap });
      return { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap, byCategory: {}, dryRun: true, sample: [] };
    }
    throw new Error(`refill produced no valid items (got ${items.length}, kept 0, shape=${skippedShape}, dup=${skippedDup}, fuzzy=${skippedFuzzy}, topicCap=${skippedTopicCap})`);
  }

  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, buckets[c].length]));
  if (dryRun) {
    // Return a sample of what WOULD have been written, without touching Redis.
    const sample = CATEGORIES.flatMap((c) => buckets[c].slice(0, 3).map((x) => ({
      category: c, year: x.year, eventKey: x.eventKey,
      eventDescription: x.eventDescription, text: x.text,
    })));
    log?.('dryRun refill complete (no writes)', { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap, byCategory });
    return { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap, byCategory, dryRun: true, sample };
  }
  await kvPipeline(rpushCmds, log);
  log?.('refill written', { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap, byCategory });
  return { kept, skippedShape, skippedDup, skippedFuzzy, skippedTopicCap, byCategory };
}

export async function queueLengths(log) {
  const cmds = CATEGORIES.map((c) => ['LLEN', queueKey(c)]);
  const results = await kvPipeline(cmds, log);
  const out = {};
  CATEGORIES.forEach((c, i) => {
    const n = results?.[i]?.result;
    out[c] = typeof n === 'number' ? n : 0;
  });
  return out;
}

async function readQueues(log) {
  // Read the full fallback chain for each category so the avoid list also
  // covers anything sitting in legacy queues that hasn't been drained yet.
  // Otherwise Claude could regenerate a topic that's already queued under
  // its old category name.
  const queueNames = [...new Set(
    CATEGORIES.flatMap((c) => QUEUE_FALLBACKS[c] || [c])
  )];
  const cmds = queueNames.map((name) => ['LRANGE', queueKey(name), '0', '-1']);
  const results = await kvPipeline(cmds, log);
  return queueNames.map((_, i) => {
    const arr = results?.[i]?.result || [];
    return arr.map(parseJSON).filter(Boolean);
  });
}

// Permanent banned topics — never produce a headline about any of these,
// regardless of the rolling 365-day dedup window. This list is shown to the
// model in the prompt; the HARD enforcement is isPermanentlyBanned() (applied at
// both the refill and serve gates). When adding a topic here, also add its terms
// to that matcher's regex — the prompt text alone does not block anything.
const PERMANENT_BANNED_TOPICS = [
  'Birth of Louise Brown / first IVF baby / first test-tube baby / any in-vitro fertilisation milestone',
];

function buildRefillPrompt({ target, totalRequested, categories = CATEGORIES, avoidDescriptions, distribution, obscureExamples = [] }) {
  // Numbered category list, built from CATEGORY_BRIEFS for only the requested
  // categories (verbatim text — see the map). Lets a batch skip over-stocked
  // categories without changing any editorial wording.
  const categoryBriefsBlock = categories
    .map((c, i) => `${i + 1}. **${c}** — ${CATEGORY_BRIEFS[c]}`)
    .join('\n');
  const avoidSection = avoidDescriptions.length
    ? avoidDescriptions.map((d) => `- ${d}`).join('\n')
    : '(none yet — this is the first batch)';

  const permanentBanSection = PERMANENT_BANNED_TOPICS.map((t) => `- ${t}`).join('\n');

  // Real player signal: headlines multiple players flagged as "too obscure".
  const obscureSection = obscureExamples.length
    ? obscureExamples.map((t) => `- ${t}`).join('\n')
    : null;

  // Dynamic distribution — tells the model which eras are under-represented in
  // the existing pool. Without this the model defaults to 1960-2010 events
  // every time, which we've used up.
  const targetPerEra = Math.ceil(distribution.totalUsed / 6);
  const distributionRows = Object.entries(distribution.eras).map(([era, n]) => {
    const gap = Math.max(0, targetPerEra - n);
    const tag = n === 0 ? 'EMPTY — PRIORITISE'
              : gap > 5 ? 'UNDER-USED — prioritise'
              : n > targetPerEra + 5 ? 'SATURATED — avoid'
              : 'balanced';
    return `  • ${era}: ${n} used  → ${tag}`;
  }).join('\n');

  return `You are generating a batch of real historical newspaper headlines for a daily year-guessing game (Wordle meets pub quiz).

Produce EXACTLY ${target} headlines in EACH of these ${categories.length} categories — total ${totalRequested} headlines:

${categoryBriefsBlock}

PERMANENTLY BANNED TOPICS — never include a headline on any of these, ever:
${permanentBanSection}

═══════════════════════════════════════════════════════════
CRITICAL: DEDUPLICATION + DIVERSITY
═══════════════════════════════════════════════════════════

The pool already contains MANY famous events. Your job is to AVOID the obvious
go-to events and find FRESH choices the audience will still recognise. Do NOT
generate a headline about any event already used (list below). Different year
of the same recurring topic is also BANNED — if any Tour de France appears,
no other Tour de France year; if any Apollo mission appears, no other Apollo.

ALREADY USED — DO NOT REPEAT OR RE-TELL:
${avoidSection}

POOL DISTRIBUTION (by era, last ${USED_WINDOW_DAYS} days):
${distributionRows}

PRIORITISE eras tagged UNDER-USED or EMPTY. AVOID generating new headlines
from eras tagged SATURATED — those are already full.

═══════════════════════════════════════════════════════════
TARGET PLAYER: an attentive 65–75-year-old broadsheet reader who follows
world news. FRESHNESS BEATS FAME. The single worst outcome is a player
thinking "I'm sure I saw this one recently" — so prioritise VARIETY over
picking the same handful of mega-famous events. Cast a WIDE, GLOBAL net:
- Pull from MANY countries and regions — Europe, Asia, Africa, Latin
  America, the Middle East, Oceania — not just the US and UK.
- One tier DOWN from the absolute A-list is welcome: an event does NOT have
  to be famous in both the US AND the UK. If a well-read person in a major
  country would recognise it (and the headline lets you date it), it's fair
  game — even if it was bigger news in one country than another.
The only floor: it must be a REAL event, name a specific entity, and give
enough context to date it (see below). Beyond that, reach further afield.

PLACEABILITY — THE PRIMARY BAR. This is a year-guessing game, so the real
test is NOT "is this event famous?" but "could a player who has NEVER heard of
this specific event still place it in roughly the right DECADE from the
headline alone?" Every headline must carry datable signal in its OWN text — a
named person whose era is known, a technology or product that brackets the
period, a country / regime / currency / company that only existed in certain
years, a war, office, or title that pins the time. If the only way to date a
headline is to already recognise the exact event, it is too hard — rewrite it
to add an era cue, or drop it.

This — not nationality — is what actually fixes the "too US-focused" complaint.
An unfamiliar American (or French, or Japanese) event is perfectly FAIR as
long as it can still be placed in time. What feels unfair to readers abroad is
the UNPLACEABLE headline, where you must already know the specific event to
have any chance. Solve for placeability and the origin of the event matters far
less.

GEOGRAPHIC VARIETY — for FRESHNESS, not quotas. Pull from many countries and
regions — the UK, Europe (France, Germany, Italy, Spain, Russia, Eastern
Europe), Asia (China, Japan, India, Korea, Vietnam, Middle East), Latin
America, Africa, Oceania, as well as the US. Variety is what keeps the board
feeling fresh day to day, so spread the net wide. Don't overload any single
country. (A server-side cap quietly trims over-US-heavy batches, so you don't
need to count — just spread the net and make every single pick placeable.)
═══════════════════════════════════════════════════════════

RECOGNISABILITY & DATABILITY — #2 is MANDATORY for every headline; #1 is
strongly preferred and is usually HOW you achieve #2:

1. **Contains a SPECIFIC named proper noun in the headline text itself** —
   a real person's name, a company name, a product name, a place name, a
   team name, a ship name, a film/song/book title, or a recognised event
   name. The named entity must appear IN the headline, not just in the
   context paragraph. (A name with a known era is the most reliable era cue.)

   ✗ FAILS (too generic, no anchor): "REVOLUTIONARY NEW BRAIN SCANNER
     OFFERS DOCTORS A WINDOW INSIDE THE HUMAN BODY" — "scanner", "doctors",
     "body" are all generic. No named person, company, or product.
   ✗ FAILS: "FAMOUS LEADER WINS BIGGEST ELECTION IN HISTORY" — generic.
   ✗ FAILS: "NEW DEVICE TRANSFORMS MEDICAL DIAGNOSIS" — generic.
   ✓ PASSES: "CT SCANNER UNVEILED: BRITAIN'S HOUNSFIELD GIVES DOCTORS A
     WINDOW INTO THE BRAIN" — names the technology (CT scanner) AND the
     inventor (Hounsfield).
   ✓ PASSES: "FORD UNVEILS MODEL T" — names Ford AND Model T.
   ✓ PASSES: "EINSTEIN PRESENTS REVOLUTIONARY THEORY OF GRAVITY" — names
     Einstein.

2. **The headline itself provides enough era signal to date within ~15 years
   — MANDATORY.** Even a reader who has never heard of the event must be able
   to infer the period from names, technology, titles, currency, regime, or
   context cues in the text. If placing the year requires already recognising
   the specific event, the headline FAILS — rewrite it to add a datable cue
   (a dated name, a period technology, a then-current title or country) or
   drop it.

STILL TOO OBSCURE — avoid headlines matching these (the floor, not the old
both-countries bar):
- Truly obscure treaties / congresses / conferences with no lasting echo
- Hyper-local events (a single town's council scandal, a regional by-election)
  with no national or international significance
- Single-match performances / regular-season results / draft picks / mid-tier
  players / county or minor-league results.
- **Country-only sports the rest of the audience can't follow — BANNED.** This
  game's players are mostly British and American, and a sport that only one of
  them follows alienates the other. So NO baseball, NO American football / NFL /
  Super Bowl, NO cricket, NO Aussie rules. Stick to genuinely global sport:
  football/soccer (World Cup, not domestic leagues), the Olympics, tennis Grand
  Slams, Formula 1, world-title boxing, athletics. Variety should come from
  different COUNTRIES and topics, NOT from niche national sports.
- Minor scientific papers with no real-world impact
- People, films, songs or albums nobody outside a tiny niche has heard of
- Anything you'd only ever find in a Wikipedia subtopic article
${obscureSection ? `
FLAGGED BY REAL PLAYERS AS "TOO OBSCURE" — do NOT generate anything like these.
Multiple players found each one unfair/unplaceable; avoid the same events AND the
same flavour of niche, hard-to-place pick:
${obscureSection}
` : ''}
GOOD (the kind of wider net we now want): the Iranian Revolution, the
Rwandan genocide, Tiananmen Square, the fall of Suharto, the Bhopal disaster,
the Batista/Castro revolution, Pelé's World Cup wins, the Aberfan disaster,
the Munich massacre, Solidarity in Poland, the Iran–Iraq war, the Chilean
coup, the Bengal famine, the partition of India, Aung San Suu Kyi, the
Bangladesh war, a major African independence, a landmark Japanese or German
or Brazilian moment. Spread the net across the whole world.

TWO CHECKS before locking each headline:
1. PLACEABILITY: "Could someone who has never heard of this event still place
   it within ~15 years from the headline text alone?" If no, fix or drop it.
2. FRESHNESS: "Is this one of the same dozen mega-famous events that always get
   picked, or is it a fresher, more varied choice from further afield?" Prefer
   the fresher one.
It only needs to be real, named, datable, and placeable — it does NOT need to
be famous everywhere.

TOPIC DENSITY LIMITS — the pool is getting WWII-heavy because so many WWII
events meet the recognisability bar. To keep variety across the archive:
- MAXIMUM 1 WWII / Holocaust / wartime-era headline per batch of ${totalRequested}.
  Includes Pearl Harbor, D-Day, Dunkirk, Hiroshima, Japan surrenders, Battle
  of Britain, the Blitz, Auschwitz, etc.
- Same principle for any other recurring theme: NO more than 1 per batch on
  royal weddings, NASA moon missions, papal events, Olympic boycotts, or any
  single-franchise topic.

REQUIREMENTS:
- Every headline ALL CAPS, dramatic, front-page newspaper style
- Factually accurate, tied to a single year 1900–2024
- Appeal to UK/US/Australian audiences but not exclusively
- EVERY eventKey and eventDescription unique across the whole batch — no two headlines about the same event
- ONLY use events you have factual knowledge of. Never invent.
- Use a CONSISTENT canonical slug for eventKey (e.g. "lockerbie-bombing-1988", "salk-polio-vaccine-1955") — these are fingerprints, do not vary them

For each candidate headline ask: "Is this in the AVOID list above? Is this era SATURATED? If yes, drop it and pick something else from an UNDER-USED era." Only commit to the headline if it passes both gates.

Return ONLY a JSON array of ${totalRequested} objects. Each object must have:
- "category": one of "Sport", "Arts & Culture", "Politics & World", "Disasters & Conflict", "Business & Money", "Science & Tech"
- "eventKey": short unique canonical slug
- "eventDescription": short plain-English name
- "text": headline (ALL CAPS)
- "year": 4-digit year (number)
- "publication": real newspaper name
- "context": 2-3 sentence factual context

No markdown fences. No preamble. No trailing commentary. Just the JSON array.`;
}

// ── Upstash Redis REST helpers ────────────────────────────────────────────
async function kvGet(key, log) {
  try {
    const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    log?.(`kv get ${key}`, { status: r.status });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.result === null || data.result === undefined) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  } catch (e) {
    log?.(`kv get ${key} threw`, { error: e.message });
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
    log?.(`kv set ${key}`, { status: r.status });
    return r.ok;
  } catch (e) {
    log?.(`kv set ${key} threw`, { error: e.message });
    return false;
  }
}

async function kvPipeline(commands, log) {
  try {
    const r = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });
    log?.('kv pipeline', { status: r.status, commands: commands.length });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    log?.('kv pipeline threw', { error: e.message });
    return null;
  }
}

// Read player "too obscure?" flags, aggregate by headline text, keep the ones
// flagged by 2+ distinct players (signal, not a single grump), most-flagged
// first, capped so the prompt stays lean.
async function readObscureExamples(log) {
  try {
    const r = await kvPipeline([['LRANGE', 'feedback:obscure', '0', '-1']], log);
    const raw = r?.[0]?.result;
    if (!Array.isArray(raw)) return [];
    const byText = new Map();
    for (const s of raw) {
      let e = null;
      try { e = typeof s === 'string' ? JSON.parse(s) : s; } catch { e = null; }
      if (!e || !e.text) continue;
      const cur = byText.get(e.text) || { text: e.text, uuids: new Set() };
      if (e.uuid) cur.uuids.add(e.uuid);
      byText.set(e.text, cur);
    }
    return [...byText.values()]
      .filter((c) => c.uuids.size >= 2)
      .sort((a, b) => b.uuids.size - a.uuids.size)
      .slice(0, 12)
      .map((c) => c.text);
  } catch {
    return [];
  }
}

export { kvGet, kvSet, kvPipeline, REDIS_URL, REDIS_TOKEN, REFILL_THRESHOLD };
export { createAvoidMatcher, avoidEntry, topicOf, isNicheNationalSport, isCricketRelated };

// ── Utilities ─────────────────────────────────────────────────────────────
function queueKey(category) {
  return `queue:${category}`;
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function toArray(x) {
  return Array.isArray(x) ? x : [];
}

function parseJSON(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}

function extractJsonArray(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  const src = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  try { return JSON.parse(src); } catch { return null; }
}
