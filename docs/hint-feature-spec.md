# Hint feature — build spec

Status: **designed, ready to build** (pending go-ahead). Research-backed; see
notes at bottom. Frontend + a small generation change.

## Concept: "the rest of the front page"

When a player is stuck on a headline, they can reveal a **second, more famous
headline from the same year** as a clue — brand-native (it's a headlines game),
teaches history, and no competitor (Timeguessr/Chronophoto) does anything like
it. Costs **half points** on that question.

Example — target is an obscure 1973 event:
> **ELSEWHERE THAT YEAR**
> *"OPEC OIL EMBARGO SENDS PETROL PRICES SOARING"*

The clue **brackets the era** (you can place ~the decade) without ever stating a
year or naming the answer event.

## In-play UX

- Under the slider, a quiet link: **🔍 Stuck? See the rest of the front page**
- Tap → confirm sheet: *"This halves your points on this headline. Reveal a clue?"* → [Reveal] / [Not yet]
- On reveal: a small framed "mini-masthead" card unfolds — `ELSEWHERE THAT YEAR` + the co-headline in the paper's serif. **No year shown.**
- One hint per question, irreversible once revealed (keeps scoring simple).
- A persistent **"½ · hint used"** tag rides that question through to results; a 💡 marks the row on the share card.
- **Player-initiated only — never auto-pop** (time-based nags are universally hated; research below).

## Data / compute — make it ~free

Do **NOT** generate on demand (a live Claude call per hint = extra compute,
latency, and it breaks Practice Mode, which must never call Claude —
see [[feedback_practice_mode_never_generates]]).

Instead, **A) bake the hint into the generation call we already make** (primary):
- Add one field to the batch output schema, `hint` — "a second, more famous
  headline from the same year; brackets the era to ~a decade; never states a
  year; never names the answer event."
- Cost = a handful of extra *output tokens* on a call we already run. No new API
  call, no round-trip. Stored on the item → Practice Mode works → zero runtime cost.
- Backfill existing catalogue = one bounded batch job, OR just ship on
  newly-generated editions and hide the button where `hint` is absent.

**B) Zero-generation fallback:** for any headline missing a baked-in `hint`, pull
a real headline from our existing pool (`used_events` / caches) with the same
year (±1–2) as the clue. Literally no generation; maximally on-brand. Trade-off:
coverage gaps for sparse years; can't guarantee the co-headline is *more* famous.

## Scoring & fairness

- `calcScore()` (src/App.jsx): `hintUsed ? round((1000 - 20*d)/2) : 1000 - 20*d`.
  Touch the lock-in calc, the results card, and the drift check
  (`calcScore(guesses[i], h.year)` must know `hintUsed` or it flags a false drift).
- Persist a parallel `hints` boolean array alongside `guesses` in `hl_weekly_v1`
  (`pushDailyHistory`) and the server `weekly` payload, so a hinted game rebuilds
  correctly cross-device.
- **Leaderboard self-corrects** — the submitted total already reflects the penalty.
  Share card marks hinted rows so shared scores stay honest.

## Open decisions (defaults chosen)

- **Penalty:** default **half points**. (Alt: −33% if we find the older/less-gamey
  audience avoids using it — we *want* them using it. Start at half, watch usage.)
- **Tiers:** ship **one** hint type (front-page). Leave room for a cheaper
  "decade window" tier later only if data asks for it.

## Build order

1. Generation: add `hint` to prompt + output schema (option A).
2. Frontend: hint link + confirm + per-question `hintUsed` state + reveal card + tag.
3. Scoring: half-points path + drift check + persistence (`hints` array local + server).
4. Share card: 💡 marker on hinted rows.
5. (Follow-up) Backfill script for existing editions; option-B fallback; optional leaderboard flag.

## Why (research)

- Hints **improve retention** — a stuck player quits and never returns; a hint
  keeps them in. Direct antidote to the existing "too obscure?" frustration.
- **Player-initiated, nudge-not-solve, ~50% penalty, framed as learning** are the
  consistent best-practice findings. The front-page clue frames it as learning,
  which fits the brand and protects the sense of accomplishment.
- Genre gap: Timeguessr has no hint; Chronophoto's is a cold mechanical penalty.
  A *teaching* hint is a genuine differentiator.
