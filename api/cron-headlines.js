// Headline maintenance cron. Designed to be run FREQUENTLY (hourly via
// cron-job.org), not just once a day — each run does at most ONE unit of
// expensive work so it can never exceed the function time limit:
//   1. Check category queue lengths. If any is below the safety floor
//      (REFILL_THRESHOLD + PREWARM_DAYS), run ONE refill batch and STOP.
//      A refill is a single ~3-min Claude call; stopping here prevents a second
//      emergency refill from stacking on top during pre-warm and timing out.
//   2. If queues are healthy, pre-warm the rolling window (today + next N-1
//      days) into headlines:YYYY-MM-DD — fast pops, no Claude calls — so admin
//      can preview them and they're stable on arrival. Idempotent on cache hit.
// Over an hour or two the window fills and stays full. The daily Vercel cron
// alone is not enough; an hourly external trigger is what keeps it healthy.
//
// Auth: Bearer CRON_SECRET (Vercel Cron adds this automatically; the external
// cron-job.org job must send the same Authorization header).

import {
  CATEGORIES,
  REFILL_THRESHOLD,
  queueLengths,
  refillQueues,
  dailyPop,
  kvPipeline,
} from './generate-headlines.js';
import { waitUntil } from '@vercel/functions';

// Runaway tripwire: email an alert if a single day's generation spend exceeds
// this. Expected is ~1 batch/day (~$0.20), so $1 means a refill path is bypassing
// the cost cap — catches any future runaway within ~an hour of the cron running.
const DAILY_SPEND_ALERT_USD = 1.0;

const PREWARM_DAYS = 7; // today + next 6
// NOTE: the once-per-day cost cap now lives INSIDE refillQueues, so it applies
// to every refill path (this cron AND dailyPop's emergency refill). The cron
// just asks; refillQueues decides whether it's actually time to pay.
const ALERT_EMAIL_TO = 'thwilford@gmail.com';
// onboarding@resend.dev is Resend's default sender — works without needing to
// verify a custom domain. Swap to e.g. 'alerts@headlines.games' once the
// domain is verified on Resend if you want a branded sender.
const ALERT_EMAIL_FROM = 'Headlines Alerts <onboarding@resend.dev>';

// Fire-and-forget alert email. Never throws (a failed email must not break
// the cron) and silently no-ops if RESEND_API_KEY isn't configured.
async function sendAlert(subject, text, log) {
  if (!process.env.RESEND_API_KEY) {
    log?.('alert email skipped — no RESEND_API_KEY', { subject });
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: ALERT_EMAIL_FROM,
        to: [ALERT_EMAIL_TO],
        subject,
        text,
      }),
    });
    log?.('alert email sent', { status: r.status, ok: r.ok, subject });
  } catch (e) {
    log?.('alert email threw', { error: e.message });
  }
}

// Sum today's generation spend from usage:refills and email an alert (at most
// once/day) if it's over DAILY_SPEND_ALERT_USD. Read-only — one Redis LRANGE, no
// Claude call — so it costs nothing and catches any future cost runaway fast.
async function checkSpendTripwire(log) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await kvPipeline([['LRANGE', 'usage:refills', '-400', '-1']], log);
    const raw = r?.[0]?.result || [];
    let spend = 0, count = 0;
    for (const s of raw) {
      let e; try { e = JSON.parse(s); } catch { continue; }
      if (e?.ts && new Date(e.ts).toISOString().slice(0, 10) === today) { spend += Number(e.cost) || 0; count++; }
    }
    spend = Number(spend.toFixed(2));
    if (spend <= DAILY_SPEND_ALERT_USD) return { today, spend, count, alerted: false };
    // One alert per day (SET NX, expires in 2 days).
    const claim = await kvPipeline([['SET', `usage:spend_alert:${today}`, '1', 'NX', 'EX', '172800']], log);
    if (claim?.[0]?.result !== 'OK') return { today, spend, count, alerted: false, already: true };
    await sendAlert(
      `Headlines — generation spend $${spend.toFixed(2)} today (over $${DAILY_SPEND_ALERT_USD} tripwire)`,
      [
        `Heads up: today's (${today}) Claude generation spend is $${spend.toFixed(2)} across ${count} refill batch(es) — above the $${DAILY_SPEND_ALERT_USD}/day tripwire.`,
        '',
        'Expected is ~1 batch/day (~$0.20). More than that means a refill path is bypassing the once-per-day cost cap — check the cron and refillQueues.',
        '',
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
      log
    );
    return { today, spend, count, alerted: true };
  } catch (e) {
    log?.('spend tripwire failed', { error: e.message });
    return { error: e.message };
  }
}

// The actual maintenance: queue check → refill (if low) → pre-warm window.
// Returns a result object; throws on unexpected error (caller alerts + catches).
async function runMaintenance(log, { force, dryRun }) {
  const result = {};
  const before = await queueLengths(log);
  result.queuesBefore = before;

  // Cost tripwire — emails if today's generation spend runs away. Cheap, no-op
  // most runs. Runs before the refill/pre-warm so it fires even on early returns.
  result.spendTripwire = await checkSpendTripwire(log);

  const safetyFloor = PREWARM_DAYS + REFILL_THRESHOLD;
  const anyLow = CATEGORIES.some((c) => (before[c] ?? 0) < safetyFloor);

  // Ask for a refill when a queue is low (or forced). refillQueues enforces the
  // once-per-day cost cap ITSELF, so on most hourly runs this is a free no-op
  // ({ skipped: true }) and only pays for a Claude batch ~once/day. Availability
  // is unaffected — dailyPop always yields a valid 5-headline edition via the
  // spare-category fallback even if a queue is empty between refills.
  let didRefill = false;
  if (force || anyLow) {
    result.refill = await refillQueues(log, { dryRun, force });
    didRefill = !dryRun && !result.refill?.skipped;
    log('refill requested', { force, dryRun, anyLow, didRefill, skipped: result.refill?.skipped || false });
    result.queuesAfter = await queueLengths(log);
  } else {
    log('queues healthy — no refill requested');
  }

  if (dryRun) { result.dryRun = true; return result; }

  // Only defer pre-warm when an ACTUAL (paid) refill ran — a cost-capped skip is
  // free, so we can safely pre-warm on the same run.
  if (didRefill) {
    log('refilled this run — deferring pre-warm to the next run');
    result.refilledOnly = true;
    return result;
  }

  // Pre-warm a rolling N-day window — fast pops from healthy queues. Per-day
  // try/catch so one bad day doesn't kill the rest of the window.
  const base = new Date();
  const prewarmed = [];
  for (let i = 0; i < PREWARM_DAYS; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().split('T')[0];
    try {
      prewarmed.push({ date, ...(await dailyPop(date, log)) });
    } catch (err) {
      log('dailyPop failed', { date, error: err.message });
      prewarmed.push({ date, error: err.message });
    }
  }
  result.prewarm = prewarmed;

  // Alert if any day in the window is missing/invalid.
  const failures = prewarmed.filter(
    (p) => p.error || !Array.isArray(p.headlines) || p.headlines.length !== 5
  );
  if (failures.length > 0) {
    const lines = [
      `The cron ran but ${failures.length} of the ${PREWARM_DAYS}-day rolling window has issues.`,
      '',
      'Failed days:',
      ...failures.map((f) => `  ${f.date}: ${f.error || `only ${f.headlines?.length || 0} headlines`}`),
      '',
      `OK days (${prewarmed.length - failures.length}):`,
      ...prewarmed.filter((p) => !failures.includes(p)).map((p) => `  ${p.date}: ${p.headlines.length} headlines (source: ${p.source})`),
      '',
      'Queue state:',
      `  before: ${JSON.stringify(before)}`,
      `  after:  ${JSON.stringify(result.queuesAfter || before)}`,
      '',
      `Refill: ${result.refill ? JSON.stringify(result.refill) : 'not run (queues were healthy)'}`,
      '',
      `Time: ${new Date().toISOString()}`,
    ];
    await sendAlert(`Headlines cron — ${failures.length} day(s) missing/invalid`, lines.join('\n'), log);
  }
  return result;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const debug = req.query?.debug === '1';
  const steps = [];
  const log = (msg, data) => steps.push(data ? { msg, ...data } : { msg });
  const force = req.query?.force === '1';
  const dryRun = req.query?.dryRun === '1';
  const testAlert = req.query?.testAlert === '1';
  const sync = req.query?.sync === '1';

  // Short-circuit for verifying the email wiring works.
  if (testAlert) {
    await sendAlert(
      'Headlines cron — test alert',
      `This is a test email from the cron alert system to confirm delivery to ${ALERT_EMAIL_TO}.\n\nTime: ${new Date().toISOString()}`,
      log
    );
    return res.status(200).json({ ok: true, testAlert: true, sentTo: ALERT_EMAIL_TO });
  }

  // The work can take minutes (a refill is a big Claude call), but the external
  // trigger (cron-job.org) times out at ~30s — and Vercel was killing the
  // function on that disconnect before the work finished, so the queue never
  // warmed. Fix: start the work, keep the function alive with waitUntil (up to
  // the 300s maxDuration), and reply INSTANTLY so the trigger always sees 200.
  // Manual/debug runs (?sync=1 / ?dryRun=1 / ?debug=1) await and return details.
  const work = runMaintenance(log, { force, dryRun }).catch(async (err) => {
    log('cron threw', { error: err.message });
    await sendAlert(
      `Headlines cron threw — ${err.message.slice(0, 90)}`,
      ['The cron threw and may have left the window incomplete.', '', `Error: ${err.message}`, '', `Stack:\n${err.stack || '(no stack)'}`, '', 'Steps:', ...steps.map((s) => '  ' + JSON.stringify(s)), '', `Time: ${new Date().toISOString()}`].join('\n'),
      log
    ).catch(() => {});
    return { error: err.message };
  });

  if (sync || dryRun || debug) {
    const r = await work;
    const ok = !r?.error;
    return res.status(ok ? 200 : 500).json(debug ? { ok, ...r, debug: { steps } } : { ok, ...r });
  }

  waitUntil(work);
  return res.status(202).json({ ok: true, started: true });
}
