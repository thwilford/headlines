// Instrumented replay: mirrors the matcher rules inline but keeps full text on
// both sides so we can see WHAT each block matched against and judge false
// positives. Lets us tune thresholds before mirroring back into the source.
// Read-only. Run: node scripts/sim-dedup2.mjs
import fs from 'fs';
import { avoidEntry, topicOf } from '../api/generate-headlines.js';

const DISTINCTIVE_MAX_DF = Number(process.env.DF || 3);
const REQUIRE_DISTINCT_LEN = Number(process.env.LEN || 5);
const adm = JSON.parse(fs.readFileSync('/tmp/hl.json', 'utf8'));
const days = (adm.days || []).slice().sort((a, b) => a.date.localeCompare(b.date));

const index = [];          // {year, tokens, text}
const df = new Map();
const topics = new Map();
const reasonCounts = {};
const samples = { distinctive: [], overlap2yr: [], overlap3: [] };
let total = 0, blocked = 0;

for (const day of days) {
  for (const h of day.headlines) {
    total++;
    const cand = { text: h.text, eventDescription: h.text, eventKey: '', year: h.year };
    const ae = avoidEntry(cand);
    let reason = null, match = null, shared = null;
    const tp = topicOf(cand);
    if (tp && (topics.get(tp) || 0) >= 1) { reason = 'topic:' + tp; }
    if (!reason && ae.tokens.size) {
      for (const u of index) {
        let ov = 0, distinct = false; const sh = [];
        for (const t of ae.tokens) if (u.tokens.has(t)) { ov++; sh.push(t); if (t.length >= REQUIRE_DISTINCT_LEN && (df.get(t) || 0) <= DISTINCTIVE_MAX_DF) distinct = true; }
        if (ov >= 3) { reason = 'overlap3'; match = u; shared = sh; break; }
        if (ov >= 2 && distinct) { reason = 'distinctive'; match = u; shared = sh; break; }
        if (ov >= 2 && typeof cand.year === 'number' && typeof u.year === 'number' && Math.abs(cand.year - u.year) <= 5) { reason = 'overlap2yr'; match = u; shared = sh; break; }
      }
    }
    if (reason) {
      blocked++;
      const k = reason.split(':')[0];
      reasonCounts[k] = (reasonCounts[k] || 0) + 1;
      if (samples[k] && samples[k].length < 40 && match) samples[k].push({ a: h.text.slice(0, 58), b: match.text.slice(0, 58), shared });
    }
    // add
    if (tp) topics.set(tp, (topics.get(tp) || 0) + 1);
    if (ae.tokens.size) { index.push({ ...ae, text: h.text }); for (const t of ae.tokens) df.set(t, (df.get(t) || 0) + 1); }
  }
}
console.log(`DF<=${DISTINCTIVE_MAX_DF} LEN>=${REQUIRE_DISTINCT_LEN} :: blocked ${blocked}/${total} (${(100 * blocked / total).toFixed(0)}%)`, reasonCounts);
console.log('\n=== DISTINCTIVE blocks (candidate ⟂ matched prior {shared}) — eyeball FPs ===');
for (const s of samples.distinctive) console.log(`  • ${s.a}\n    ↳ ${s.b}  {${s.shared.join(',')}}`);
