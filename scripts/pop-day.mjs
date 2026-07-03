// Pop ONE day's edition from existing queues (no Claude call unless a queue
// can't yield a valid non-duplicate item). Env: DATE=YYYY-MM-DD.
import fs from 'fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { if (!l.includes('=')) continue; const i = l.indexOf('='); const k = l.slice(0, i).trim(); if (k) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); }
const { dailyPop } = await import('../api/generate-headlines.js');
const DATE = process.env.DATE;
if (!DATE) { console.error('set DATE'); process.exit(1); }
const log = (m, d) => console.log('  ·', m, d ? JSON.stringify(d) : '');
const r = await dailyPop(DATE, log);
console.log('\n=== ' + DATE + ' (source: ' + r.source + ') ===');
for (const h of r.headlines) console.log(`  [${h.category}] ${h.year}  ${h.text}`);
