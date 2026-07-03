// Generate ONE fresh non-duplicate headline for a given category via a targeted
// Claude call, validate against the live dedup corpus, and write it into a
// cached edition slot. Env: DATE, SLOT, CATEGORY, APPLY=1.
import fs from 'fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { if (!l.includes('=')) continue; const i = l.indexOf('='); const k = l.slice(0, i).trim(); if (k) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); }
const { createAvoidMatcher, isValidHeadline, isNicheNationalSport } = await import('../api/generate-headlines.js');
const BASE = process.env.KV_REST_API_URL, TOK = process.env.KV_REST_API_TOKEN;
const APPLY = process.env.APPLY === '1';
const DATE = process.env.DATE, SLOT = Number(process.env.SLOT), CATEGORY = process.env.CATEGORY;
const USED_WINDOW_MS = 365 * 86_400_000;
const cmd = async (c) => { const r = await fetch(BASE + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); return r.ok ? r.json() : null; };
const get = async (k) => { const r = await fetch(BASE + '/get/' + encodeURIComponent(k), { headers: { Authorization: 'Bearer ' + TOK } }); const j = await r.json(); try { return JSON.parse(j.result); } catch { return j.result; } };

const edition = await get('headlines:' + DATE);
const used = (await get('used_events')) || [];
let cursor = '0'; const keys = [];
do { const r = await cmd([['SCAN', cursor, 'MATCH', 'headlines:????-??-??', 'COUNT', '200']]); const res = r?.[0]?.result; cursor = res?.[0] || '0'; for (const k of (res?.[1] || [])) keys.push(k); } while (cursor !== '0');
const gets = await cmd(keys.map((k) => ['GET', k]));
const archive = [];
keys.forEach((k, i) => { let arr; try { arr = JSON.parse(gets[i].result); } catch { return; } if (Array.isArray(arr)) for (const h of arr) if (h?.text) archive.push({ eventDescription: h.text, text: h.text, year: h.year, category: h.category }); });
const recentUsed = used.filter((e) => typeof e?.addedAt === 'number' && e.addedAt >= Date.now() - USED_WINDOW_MS);
const others = edition.filter((_, i) => i !== SLOT).map((h) => ({ eventDescription: h.text, text: h.text, year: h.year, category: h.category }));
const matcher = createAvoidMatcher([...recentUsed, ...archive, ...others]);

// Avoid descriptions: everything in this category from used + archive.
const avoid = [...recentUsed, ...archive].filter((e) => e.category === CATEGORY || !e.category).map((e) => e.eventDescription || e.text).filter(Boolean);
const sportHint = CATEGORY === 'Sport'
  ? `\nThese MUST be GLOBALLY famous sport — football/soccer (World Cup), the Olympics, world-title boxing, tennis Grand Slams, athletics. A famous UPSET or SHOCK is ideal (e.g. USA 1-0 England 1950, Leicester City 2016, Buster Douglas beats Tyson 1990, Ali beats Foreman 1974, Miracle on Ice). ABSOLUTELY NO baseball, American football/NFL, ice hockey/Stanley Cup, basketball/NBA, cricket — those are country-only and banned.`
  : '';
const prompt = `Generate 8 real historical newspaper headlines in the category "${CATEGORY}" for a year-guessing game.
Target player: an attentive 65-75 year old who reads broadsheets; recognisable to a well-read person in many countries.
Each headline must name a SPECIFIC real person/company/product/place/mission so the era is datable. ALL CAPS, dramatic, front-page style, factually accurate, tied to a single year 1900-2024.${sportHint}

DO NOT use any of these already-used events (or different-year/reworded versions of them):
${avoid.slice(0, 220).map((d) => '- ' + d).join('\n')}

Return ONLY a JSON array of 8 objects, each: {"eventKey","eventDescription","text","year","publication","pubColor","context"}. No markdown, no preamble.`;

const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }) });
const data = await resp.json();
const text = data.content?.[0]?.text || '';
const clean = text.replace(/```json|```/g, '').trim();
let items; try { items = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1)); } catch { console.log('parse fail:', text.slice(0, 200)); process.exit(1); }

let pick = null;
for (const raw of items) {
  if (!raw || typeof raw.text !== 'string' || typeof raw.year !== 'number') continue;
  const cand = { ...raw, category: CATEGORY };
  if (!isValidHeadline(cand)) { console.log('  skip invalid:', (raw.text || '').slice(0, 45)); continue; }
  if (isNicheNationalSport(cand)) { console.log('  skip niche-sport:', raw.text.slice(0, 45)); continue; }
  const reason = matcher.check(cand);
  if (reason) { console.log(`  skip [${reason}]:`, raw.text.slice(0, 45)); continue; }
  pick = cand; break;
}
if (!pick) { console.log('no fresh candidate found among', items.length); process.exit(1); }
const newHeadline = { id: edition[SLOT].id, text: pick.text, year: pick.year, publication: pick.publication || 'The Times', pubColor: pick.pubColor || '#1a1a1a', context: pick.context || '', category: CATEGORY };
console.log('\ncurrent slot:', edition[SLOT].text);
console.log('REPLACEMENT:', newHeadline.year, '::', newHeadline.text);
if (!APPLY) { console.log('\n(preview only — APPLY=1 to write)'); process.exit(0); }
const newEdition = edition.slice(); newEdition[SLOT] = newHeadline;
const newUsed = [...used, { eventKey: pick.eventKey || 'manual-' + DATE + '-' + SLOT, eventDescription: pick.eventDescription || pick.text, text: pick.text, year: pick.year, category: CATEGORY, addedAt: Date.now() }];
const res = await cmd([['SET', 'headlines:' + DATE, JSON.stringify(newEdition)], ['SET', 'used_events', JSON.stringify(newUsed)]]);
console.log('write:', JSON.stringify(res));
const check = await get('headlines:' + DATE);
console.log('verified slot[' + SLOT + ']:', check[SLOT].text);
