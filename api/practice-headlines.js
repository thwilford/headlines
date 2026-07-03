// Practice mode data source.
// READ-ONLY against the existing `headlines:YYYY-MM-DD` cache — never writes,
// never deletes. Filters to past + today (no spoiling future days).
//
//   GET /api/practice-headlines
//     → manifest: { decades: { "1980": 12, ... }, categories: { "Sport": 8, ... } }
//   GET /api/practice-headlines?mode=decade&value=1980
//     → { headlines: [5 random 1980s headlines] }
//   GET /api/practice-headlines?mode=category&value=Sport
//     → { headlines: [5 random Sport headlines] }

const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// Each picker category accepts these underlying data tags (new + every legacy
// scheme we've ever shipped). This is the bridge between Dad's 6 friendly
// labels and what's actually written into headlines:* in Redis (mix of new
// and old generator tags). IMPORTANT: never remove legacy keys here — that's
// what keeps historical headlines reachable from the new picker. See
// feedback_never_delete_headline_data.
const CATEGORY_FILTERS = {
  'Sport':                ['Sport'],
  'Arts & Culture':       ['Arts & Culture', 'Pop Culture'],
  'Politics & World':     ['Politics & World', 'World Events', 'Politics/World Events', 'Politics'],
  'Disasters & Conflict': ['Disasters & Conflict', 'Crime & Disasters', 'Crime/Scandal/Disaster'],
  'Business & Money':     ['Business & Money', 'Business'],
  'Science & Tech':       ['Science & Tech', 'Tech & Science', 'Science/Tech'],
};

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis env vars missing' });
  }

  const today = new Date().toISOString().split('T')[0];

  // Scan for headline keys
  let cursor = '0';
  const keys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'headlines:????-??-??', 'COUNT', '200']);
    cursor = r?.result?.[0] || '0';
    keys.push(...(r?.result?.[1] || []));
  } while (cursor !== '0');

  // Past + today only — exclude future-dated keys (queued days)
  const visibleKeys = keys.filter((k) => k.replace('headlines:', '') <= today);
  if (visibleKeys.length === 0) {
    return res.status(200).json({ decades: {}, categories: {}, headlines: [] });
  }

  const results = await pipeline(visibleKeys.map((k) => ['GET', k]));
  if (!results) return res.status(500).json({ error: 'Redis read failed' });

  // Flatten into one big array, and keep each day's edition intact (by date)
  // so we can serve a specific past edition for "Recent editions" mode.
  const allHeadlines = [];
  const byDate = {};
  for (let i = 0; i < visibleKeys.length; i++) {
    const raw = results[i]?.result;
    if (!raw) continue;
    let arr;
    try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { continue; }
    if (!Array.isArray(arr)) continue;
    const date = visibleKeys[i].replace('headlines:', '');
    const valid = arr.filter((h) => h && typeof h.year === 'number' && h.text);
    if (valid.length > 0) byDate[date] = valid;
    for (const h of valid) allHeadlines.push(h);
  }

  // Manifest mode (no params): bucket counts so the picker shows availability
  const mode = req.query?.mode;
  const value = req.query?.value;
  if (!mode) {
    const decades = {};
    const categories = {};
    // Initialise all picker categories at 0 so the UI knows they exist even if empty
    for (const key of Object.keys(CATEGORY_FILTERS)) categories[key] = 0;
    for (const h of allHeadlines) {
      const decade = Math.floor(h.year / 10) * 10;
      decades[decade] = (decades[decade] || 0) + 1;
      // Find which picker category this headline's tag belongs to (via alias map)
      if (h.category) {
        for (const [pickerKey, aliases] of Object.entries(CATEGORY_FILTERS)) {
          if (aliases.includes(h.category)) {
            categories[pickerKey] += 1;
            break;
          }
        }
      }
    }
    // All past editions (exclude today), newest first — only days with a
    // full 5-headline edition. Lets players catch up on any day they missed.
    // Editions are stored with no TTL, so this is the full archive and grows
    // by one each day.
    const recentDates = Object.keys(byDate)
      .filter((d) => d < today && byDate[d].length >= 5)
      .sort((a, b) => b.localeCompare(a));
    return res.status(200).json({ decades, categories, recentDates, total: allHeadlines.length });
  }

  // Date mode: return a specific past edition in its original order (the real
  // 5 headlines from that day — not a random sample).
  if (mode === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value >= today) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    const edition = byDate[value];
    if (!Array.isArray(edition) || edition.length === 0) {
      return res.status(200).json({ headlines: [], note: 'No edition cached for that day.' });
    }
    const headlines = edition.slice(0, 5).map((h, i) => ({
      id: `practice_date_${value}_${i}`,
      text: h.text,
      year: h.year,
      publication: h.publication,
      pubColor: h.pubColor || '#1a1a1a',
      context: h.context || '',
      category: h.category || null,
    }));
    return res.status(200).json({ headlines, available: edition.length });
  }

  // Pick mode: filter then random sample
  let pool;
  if (mode === 'decade') {
    const d = parseInt(value, 10);
    if (!Number.isFinite(d)) return res.status(400).json({ error: 'Invalid decade' });
    pool = allHeadlines.filter((h) => Math.floor(h.year / 10) * 10 === d);
  } else if (mode === 'category') {
    const aliases = CATEGORY_FILTERS[value];
    if (!aliases) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    pool = allHeadlines.filter((h) => aliases.includes(h.category));
  } else {
    return res.status(400).json({ error: 'Invalid mode' });
  }

  if (pool.length === 0) {
    return res.status(200).json({ headlines: [], note: 'No headlines match this filter yet.' });
  }

  // Fisher–Yates shuffle then slice — guarantees uniqueness within the round
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const headlines = shuffled.slice(0, 5).map((h, i) => ({
    id: `practice_${mode}_${value}_${i}_${Date.now()}`,
    text: h.text,
    year: h.year,
    publication: h.publication,
    pubColor: h.pubColor || '#1a1a1a',
    context: h.context || '',
    category: h.category || null,
  }));

  res.status(200).json({ headlines, available: pool.length });
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
