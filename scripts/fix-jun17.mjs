// Surgical fix for headlines:2026-06-17 slot [2], which duplicates the 2004
// Boxing Day tsunami already served on 2026-05-29. Pops a fresh Disasters &
// Conflict item from the live queue through the NEW matcher (built from the
// 365-day used_events + archive + the rest of the 17 June edition), so the
// replacement is guaranteed non-duplicate. Mirrors production pop behaviour:
// any dup/invalid items popped along the way are correctly removed from the
// queue. Preview by default; set APPLY=1 to write.
import fs from 'fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  if (!l.includes('=')) continue; const i = l.indexOf('='); const k = l.slice(0, i).trim();
  if (k) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const { createAvoidMatcher, isValidHeadline } = await import('../api/generate-headlines.js');
const BASE = process.env.KV_REST_API_URL, TOK = process.env.KV_REST_API_TOKEN;
const APPLY = process.env.APPLY === '1';
const DATE = '2026-06-17', SLOT = 2;
const FALLBACKS = ['Disasters & Conflict', 'Crime & Disasters', 'Crime/Scandal/Disaster'];
const USED_WINDOW_MS = 365 * 86_400_000;

async function cmd(c) {
  const r = await fetch(BASE + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
  return r.ok ? r.json() : null;
}
const get = async (k) => { const r = await fetch(BASE + '/get/' + encodeURIComponent(k), { headers: { Authorization: 'Bearer ' + TOK } }); const j = await r.json(); try { return JSON.parse(j.result); } catch { return j.result; } };

const edition = await get('headlines:' + DATE);
const used = (await get('used_events')) || [];
console.log('current slot[2]:', edition[SLOT].text);

// Archive (last 365d) for rich fingerprints.
let cursor = '0'; const keys = [];
do { const r = await cmd([['SCAN', cursor, 'MATCH', 'headlines:????-??-??', 'COUNT', '200']]); const res = r?.[0]?.result; cursor = res?.[0] || '0'; for (const k of (res?.[1] || [])) keys.push(k); } while (cursor !== '0');
const minDate = new Date(Date.now() - USED_WINDOW_MS).toISOString().slice(0, 10);
const recentKeys = keys.filter((k) => k.replace('headlines:', '') >= minDate);
const gets = await cmd(recentKeys.map((k) => ['GET', k]));
const archive = [];
recentKeys.forEach((k, i) => { let arr; try { arr = JSON.parse(gets[i].result); } catch { return; } if (Array.isArray(arr)) for (const h of arr) if (h?.text) archive.push({ eventDescription: h.text, text: h.text, year: h.year, category: h.category }); });

const recentUsed = used.filter((e) => typeof e?.addedAt === 'number' && e.addedAt >= Date.now() - USED_WINDOW_MS);
// Other slots of THIS edition must also be avoided (don't pick a dup of them).
const others = edition.filter((_, i) => i !== SLOT).map((h) => ({ eventDescription: h.text, text: h.text, year: h.year, category: h.category }));
const matcher = createAvoidMatcher([...recentUsed, ...archive, ...others]);

// Non-destructively scan Disasters & Conflict (+fallbacks) for the first valid
// non-dup item. We record its raw JSON + source queue so APPLY can remove that
// exact item with LREM (so it isn't later served to another day as a dup).
let replacement = null, replRaw = null, replQueue = null; const skipped = [];
outer: for (const name of FALLBACKS) {
  const r = await cmd([['LRANGE', 'queue:' + name, '0', '-1']]);
  for (const raw of (r?.[0]?.result || [])) {
    let p; try { p = JSON.parse(raw); } catch { continue; }
    if (!isValidHeadline(p)) { skipped.push(['invalid', (p?.text || '').slice(0, 50)]); continue; }
    const reason = matcher.check(p);
    if (reason) { skipped.push([reason, p.text.slice(0, 50)]); continue; }
    replacement = p; replRaw = raw; replQueue = 'queue:' + name; break outer;
  }
}
if (!replacement) { console.log('NO replacement found. skipped:', skipped.length); skipped.forEach((d) => console.log('  [' + d[0] + '] ' + d[1])); process.exit(1); }
console.log('\nskipped while scanning (' + skipped.length + '), from queue ' + replQueue);

const newHeadline = {
  id: edition[SLOT].id, text: replacement.text, year: replacement.year,
  publication: replacement.publication, pubColor: replacement.pubColor || '#1a1a1a',
  context: replacement.context || '', category: 'Disasters & Conflict',
};
console.log('\nREPLACEMENT:', newHeadline.year, '::', newHeadline.text);

if (!APPLY) { console.log('\n(preview only — set APPLY=1 to write)'); process.exit(0); }

const newEdition = edition.slice(); newEdition[SLOT] = newHeadline;
const newUsed = [...used, { eventKey: replacement.eventKey, eventDescription: replacement.eventDescription, text: replacement.text, year: replacement.year, category: 'Disasters & Conflict', addedAt: Date.now() }];
const setRes = await cmd([
  ['SET', 'headlines:' + DATE, JSON.stringify(newEdition)],
  ['SET', 'used_events', JSON.stringify(newUsed)],
  ['LREM', replQueue, '1', replRaw],   // remove the chosen item so it isn't served again later
]);
console.log('\nwrite result:', JSON.stringify(setRes));
const check = await get('headlines:' + DATE);
console.log('verified slot[2]:', check[SLOT].text);
