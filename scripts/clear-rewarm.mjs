// Clear cached editions for dates AFTER today and re-warm them through the
// deployed (new-dedup) generate endpoint. Past + today's editions are never
// touched (played history / live edition stay intact). Preview by default;
// APPLY=1 to delete + regenerate.
import fs from 'fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  if (!l.includes('=')) continue; const i = l.indexOf('='); const k = l.slice(0, i).trim();
  if (k) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const BASE = process.env.KV_REST_API_URL, TOK = process.env.KV_REST_API_TOKEN;
const SITE = 'https://www.headlines.games';
const APPLY = process.env.APPLY === '1';
const TODAY = new Date().toISOString().slice(0, 10); // 2026-06-11

async function cmd(c) { const r = await fetch(BASE + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); return r.ok ? r.json() : null; }

// Find all cached edition dates strictly after today.
let cursor = '0'; const keys = [];
do { const r = await cmd([['SCAN', cursor, 'MATCH', 'headlines:????-??-??', 'COUNT', '200']]); const res = r?.[0]?.result; cursor = res?.[0] || '0'; for (const k of (res?.[1] || [])) keys.push(k); } while (cursor !== '0');
const futureDates = keys.map((k) => k.replace('headlines:', '')).filter((d) => d > TODAY).sort();
console.log('today:', TODAY);
console.log('future cached editions to clear & re-warm:', futureDates.join(', ') || '(none)');
if (futureDates.length === 0) process.exit(0);

if (!APPLY) { console.log('\n(preview only — set APPLY=1 to delete + regenerate)'); process.exit(0); }

// Delete then regenerate each, in date order so dedup accumulates deterministically.
for (const date of futureDates) {
  await cmd([['DEL', 'headlines:' + date]]);
  const r = await fetch(SITE + '/api/generate-headlines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
  const j = await r.json().catch(() => ({}));
  const cats = (j.headlines || []).map((h) => `${h.category}:${h.year}`).join(', ');
  console.log(`${date}  [${r.status} ${j.source || 'err'}]  ${cats || JSON.stringify(j).slice(0, 120)}`);
}
console.log('\ndone — re-warmed', futureDates.length, 'editions under deployed code');
