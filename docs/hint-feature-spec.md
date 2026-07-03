# Hint button — design pass

Status: **spec / not built.** Design-first per request. This documents the
decision surface before any code.

## The idea (from notes)

> A hint button — if you're stuck on a question, you click hint and it explains
> that by using it you'll score **half points** on this question. The hint is:
> "At the same time as this headline, this other thing happened: [X]."

The co-event framing is the distinctive part. It doesn't just narrow the range —
it *teaches* by anchoring the unknown event to a second, more-datable event. That
fits Headlines' "attentive broadsheet reader" audience and the "placeability over
fame" philosophy already baked into generation (`api/generate-headlines.js`).

## What has to be true to ship it

### 1. Hint content — a second dated anchor per headline (the real cost)

Today a headline item carries: `text, year, publication, context, category,
eventKey, eventDescription` (see `dailyPop()` in `api/generate-headlines.js:440`).
There is **no** second-event field. A co-event hint needs one:

```
hint: "Weeks earlier, England won the football World Cup at Wembley."   // dated anchor, no year stated
```

Design rules for the hint string (fold into the generator prompt):
- Names a **different**, **more-recognisable** event from the **same rough window**
  (±2–3 years) — enough to bracket the decade, not pinpoint the year.
- **Never states a year** (that would hand over the answer) and never names the
  answer event.
- One sentence. Same placeability bar as the headline itself.

**Cost:** this is real generation work and a schema change. Options:
- **(A) Generate at creation time** — add `hint` to the batch prompt + output
  schema, so every new queued headline ships with one. Clean, but doesn't cover
  the existing queue/back-catalogue.
- **(B) Backfill pass** — a one-off script over `used_events` / queued items that
  asks Claude for a hint per existing headline. Needed if we want hints on
  already-generated editions (Practice Mode reuses those — see the
  "practice never generates" rule).
- Recommend **A now, B as a follow-up** once the shape is proven.

Fallback when a headline has no `hint` (old data): hide the button, or offer a
cheaper generic hint (see tiered options) so the UI degrades gracefully.

### 2. Scoring — half points on a hinted question

`calcScore()` (`src/App.jsx:1130`) is `Math.max(0, 1000 - 20 * d)` internal
(display = /10). Hinted scoring:

```
hintUsed ? Math.max(0, Math.round((1000 - 20 * d) / 2))
         : Math.max(0, 1000 - 20 * d)
```

Touch points: the lock-in score calc, the results score card, and the drift
check at `src/App.jsx:2642` (`calcScore(guesses[i], h.year)` must know `hintUsed`
or it will flag a "drift"). Persist a `hints` boolean array alongside `guesses`
in the `hl_weekly_v1` entry (`pushDailyHistory`, `src/App.jsx:232`) and in the
server `weekly` payload, so a hinted game rebuilds correctly on other devices.

### 3. Fairness — leaderboard + share must not hide a hint

A hinted 90 shouldn't silently outrank an honest 88.
- **Leaderboard** (`api/leaderboard.js`): the submitted total already reflects the
  half-points, so ranking is self-correcting. Optionally flag hinted games with a
  small marker (e.g. a "used a hint" dot) — decide later; not required for launch.
- **Share card** (`ShareCard`, `src/App.jsx:1339`): a hinted question should be
  visually distinguishable (e.g. a small "💡" on that row) so shared scores stay
  honest. Low effort, high trust value — include it.

## UX flow

- During play, below the slider: a quiet **"💡 Need a hint?"** link.
- Tapping it opens a small confirm: *"Using a hint halves your points on this
  headline. Reveal it?"* — so the cost is explicit and never accidental.
- On confirm: reveal the co-event line, mark `hintUsed[i] = true`, and show a
  persistent "½ points — hint used" tag on that question through to results.
- One hint per question, irreversible once revealed (keeps scoring simple).

## Tiered hints (optional, later)

If the single co-event hint proves popular, a two-tier system:
- **Tier 1 — cheap:** "The answer is between 19XX and 19YY" (a ~20-year window).
  Costs less (e.g. −25%). No new data needed — derived from the year.
- **Tier 2 — rich:** the co-event anchor. Half points.

Start with **Tier 2 only** — it's the distinctive, on-brand one. Tier 1 is a fast
follow if we want a lower-commitment option.

## Edge cases

- **Practice Mode** reuses cached editions and must never call Claude
  (`practice_mode_never_generates`). Hints must therefore be **stored on the
  item**, not generated on demand — reinforces option A/B above.
- **Exact-year guess after a hint:** still halved. That's intended — the hint
  materially helped.
- **Missing hint data:** hide the button for that item; never block play.
- **Streak / daily completion:** unaffected — a hinted game is still a completed
  game.

## Build order (when greenlit)

1. Add `hint` to the generation prompt + output schema (option A).
2. Frontend: hint link + confirm + per-question `hintUsed` state + tag.
3. Scoring: half-points in `calcScore` path + drift check + persistence
   (`guesses` gains a parallel `hints` array locally and in the server `weekly`).
4. Share card marker for hinted rows.
5. (Follow-up) Backfill script for existing editions; optional leaderboard flag;
   optional Tier-1 window hint.

## Recommendation

Ship **Tier 2 (co-event) only**, generated at creation time, half points, with a
share-card marker and an explicit confirm step. Defer backfill, tiered hints, and
any leaderboard flagging until the core proves itself. Main cost is the
generation/schema change (1), not the UI.
