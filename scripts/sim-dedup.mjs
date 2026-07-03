// Simulation: replay the live headlines archive in date order and ask the NEW
// matcher, at each day, "would this headline have been blocked as a repeat?"
// Measures how many repeats we now catch and whether we over-block.
// Read-only. Run: node scripts/sim-dedup.mjs
import fs from 'fs';
import { createAvoidMatcher, topicOf } from '../api/generate-headlines.js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const BASE = env.KV_REST_API_URL, TOK = env.KV_REST_API_TOKEN;
const r = await fetch(BASE + '/get/used_events', { headers: { Authorization: 'Bearer ' + TOK } });
// archive editions
const adm = JSON.parse(fs.readFileSync('/tmp/hl.json', 'utf8'));
const days = (adm.days || []).slice().sort((a, b) => a.date.localeCompare(b.date));

// Replay: corpus starts empty; each day, check each headline against the matcher
// built from all PRIOR accepted headlines, then add it.
const matcher = createAvoidMatcher([]);
const blocks = [];
const reasonCounts = {};
let total = 0;
for (const day of days) {
  for (const h of day.headlines) {
    total++;
    const cand = { text: h.text, eventDescription: h.text, eventKey: '', year: h.year };
    const reason = matcher.check(cand);
    if (reason) {
      reasonCounts[reason.split(':')[0]] = (reasonCounts[reason.split(':')[0]] || 0) + 1;
      blocks.push({ date: day.date, year: h.year, reason, text: h.text.slice(0, 64), topic: topicOf(cand) });
    }
    matcher.add(cand); // simulate it having been shown
  }
}
console.log(`replayed ${total} headlines across ${days.length} days`);
console.log(`flagged as repeat: ${blocks.length} (${(100 * blocks.length / total).toFixed(0)}%)`);
console.log('by reason:', reasonCounts);
console.log('\n--- tsunami / earthquake decisions ---');
for (const b of blocks) if (/tsunami|earthquake|quake/i.test(b.text)) console.log(`  BLOCK [${b.reason}] ${b.date}(${b.year}) ${b.text}`);
console.log('\n--- first 30 blocked (would have been replaced) ---');
for (const b of blocks.slice(0, 30)) console.log(`  [${b.reason}] ${b.date}(${b.year}) ${b.text}`);
