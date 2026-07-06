// Email-based, password-free auth for Headlines.
//
// One endpoint, four actions (via ?action= or body.action):
//   request → { email }            → emails a 6-digit sign-in code
//   verify  → { email, code, migrate? } → checks code, creates session cookie
//   me      → (cookie)             → returns the logged-in user (or null)
//   logout  → (cookie)             → clears the session
//
// Redis keys (Upstash):
//   auth:code:<email>     short-lived 6-digit code (EX 600s)
//   auth:rl:<email>       rate-limit guard on code requests (EX 30s)
//   auth:session:<token>  → email (EX 1 year); token lives in an httpOnly cookie
//   auth:user:<email>     → { email, createdAt, name, migrate? }
//
// The daily game stays fully usable with NO account — this only powers the
// optional carrots (archive, stats, streak-save).

import crypto from 'crypto';

const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = 'Headlines <hello@headlines.games>';

const CODE_TTL = 600;            // 10 min
const SESSION_TTL = 60 * 60 * 24 * 365; // 1 year
const RL_TTL = 30;               // min seconds between code requests per email

export default async function handler(req, res) {
  if (!BASE || !TOKEN) return res.status(500).json({ error: 'Redis not configured' });

  const action = req.query?.action || req.body?.action;
  // Unsubscribe is a GET (clicked from an email link) and returns an HTML page.
  if (action === 'unsubscribe') return handleUnsubscribe(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (action === 'request') return await handleRequest(req, res);
    if (action === 'verify')  return await handleVerify(req, res);
    if (action === 'me')      return await handleMe(req, res);
    if (action === 'sync')    return await handleSync(req, res);
    if (action === 'remind')  return await handleRemind(req, res);
    if (action === 'logout')  return await handleLogout(req, res);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── Actions ───────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Enter a valid email address' });

  // Light rate limit: one code per RL_TTL seconds per email.
  const rl = await redis(['SET', `auth:rl:${email}`, '1', 'NX', 'EX', String(RL_TTL)]);
  if (rl?.result !== 'OK') {
    return res.status(429).json({ error: 'Hang on, wait a few seconds before requesting another code.' });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await redis(['SET', `auth:code:${email}`, code, 'EX', String(CODE_TTL)]);
  await sendCodeEmail(email, code);
  return res.status(200).json({ ok: true });
}

async function handleVerify(req, res) {
  const email = normEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code' });

  const stored = (await redis(['GET', `auth:code:${email}`]))?.result;
  if (!stored || !timingSafeEqual(stored, code)) {
    return res.status(401).json({ error: 'That code is wrong or has expired. Try again.' });
  }
  await redis(['DEL', `auth:code:${email}`]);

  // Create or load the user, then merge in the player's local play history so a
  // returning daily player keeps their streak. Merge (union by date) means it
  // can only grow — signing in never reduces a streak.
  let user = parse((await redis(['GET', `auth:user:${email}`]))?.result);
  if (!user) user = { email, createdAt: Date.now(), weekly: [] };
  user.weekly = mergeWeekly(user.weekly, req.body?.migrate?.weekly);
  const country = countryFromReq(req);
  if (country) user.country = country;
  const name = sanitizeName(req.body?.name);
  if (name) user.name = name;
  if (req.body?.tz && typeof req.body.tz === 'string') user.tz = req.body.tz.slice(0, 64);
  // Daily-reminder opt-in (default on). Mint an unsubscribe token once.
  if (typeof req.body?.remind === 'boolean') user.remind = req.body.remind;
  else if (user.remind === undefined) user.remind = true;
  if (!user.unsub) user.unsub = crypto.randomBytes(8).toString('hex');
  await redis(['SET', `auth:user:${email}`, JSON.stringify(user)]);

  const token = crypto.randomBytes(32).toString('hex');
  await redis(['SET', `auth:session:${token}`, email, 'EX', String(SESSION_TTL)]);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL));
  return res.status(200).json({ ok: true, ...userPayload(user) });
}

async function handleMe(req, res) {
  const email = await emailFromCookie(req);
  if (!email) return res.status(200).json({ user: null });
  const user = parse((await redis(['GET', `auth:user:${email}`]))?.result);
  return res.status(200).json(user ? userPayload(user) : { user: null });
}

// Push the latest local play history up to the account (called after a logged-in
// player finishes a game). Union-merge so nothing is lost across devices.
async function handleSync(req, res) {
  const email = await emailFromCookie(req);
  if (!email) return res.status(401).json({ error: 'Not signed in' });
  const user = parse((await redis(['GET', `auth:user:${email}`]))?.result);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  user.weekly = mergeWeekly(user.weekly, req.body?.weekly);
  // Passively backfill timezone + country for accounts created before we
  // captured them (e.g. users already logged in from an earlier session).
  if (req.body?.tz && typeof req.body.tz === 'string') user.tz = req.body.tz.slice(0, 64);
  const country = countryFromReq(req);
  if (country) user.country = country;
  // Display name for the leaderboard -- set at sign-in or edited inline later.
  if (req.body?.name !== undefined) {
    const name = sanitizeName(req.body.name);
    if (name) user.name = name;
  }
  // Explicit reminder opt-in/out from the in-app toggle.
  if (typeof req.body?.remind === 'boolean') {
    user.remind = req.body.remind;
    if (!user.unsub) user.unsub = crypto.randomBytes(8).toString('hex');
  }
  await redis(['SET', `auth:user:${email}`, JSON.stringify(user)]);
  return res.status(200).json(userPayload(user));
}

async function handleLogout(req, res) {
  const token = cookieToken(req);
  if (token) await redis(['DEL', `auth:session:${token}`]);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  return res.status(200).json({ ok: true });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function emailFromCookie(req) {
  const token = cookieToken(req);
  if (!token) return null;
  return (await redis(['GET', `auth:session:${token}`]))?.result || null;
}

function cookieToken(req) {
  const raw = req.headers?.cookie || '';
  const m = raw.match(/(?:^|;\s*)hl_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function sessionCookie(token, maxAge) {
  const parts = [
    `hl_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

// Vercel injects the visitor's ISO country code on every request header.
function countryFromReq(req) {
  const c = req.headers?.['x-vercel-ip-country'];
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c) ? c : null;
}

// Display name shown on the public leaderboard. Strip control chars, collapse
// whitespace, cap at 20 chars. Kept in sync with leaderboard.js's sanitizer.
function sanitizeName(n) {
  if (typeof n !== 'string') return '';
  return Array.from(n)
    .filter(ch => ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) !== 0x7f)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

function normEmail(e) {
  if (typeof e !== 'string') return null;
  const t = e.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 254 ? t : null;
}

function userPayload(u) {
  const weekly = Array.isArray(u.weekly) ? u.weekly : [];
  return {
    user: { email: u.email, name: u.name || null, createdAt: u.createdAt },
    weekly,
    streak: deriveStreak(weekly),
    remind: !!u.remind,
  };
}

// Union two play-history lists by date (each entry { date, score, guesses? }).
// Keeps the highest score per date, and preserves the per-question guesses from
// whichever entry has them (so the full results breakdown survives merges/devices).
function mergeWeekly(a, b) {
  const byDate = new Map();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
      const prev = byDate.get(e.date);
      const score = Number(e.score) || 0;
      const guesses = Array.isArray(e.guesses) ? e.guesses : (prev && prev.guesses);
      // Per-question hint flags travel with guesses so a hinted game's per-row
      // scores rebuild correctly on another device (halved where a hint was used).
      const hints = Array.isArray(e.hints) ? e.hints : (prev && prev.hints);
      if (!prev || score > prev.score) {
        const entry = { date: e.date, score: prev && score < prev.score ? prev.score : score };
        if (guesses) entry.guesses = guesses;
        if (hints) entry.hints = hints;
        byDate.set(e.date, entry);
      } else {
        if (guesses && !prev.guesses) prev.guesses = guesses; // backfill onto the kept (higher-score) entry
        if (hints && !prev.hints) prev.hints = hints;
      }
    }
  }
  // Retain ~1 year so the results chart's W / M / 6M / Y ranges have data to
  // draw once players build up history. Entries are tiny; a year is a few KB.
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date)).slice(-370);
}

// Current streak = consecutive days played ending today (or yesterday — the
// streak is still "alive" if they played yesterday but haven't played today yet).
function deriveStreak(weekly) {
  const played = new Set((weekly || []).map((e) => e.date));
  if (played.size === 0) return 0;
  const DAY = 86_400_000;
  const todayStr = new Date().toISOString().slice(0, 10);
  // Anchor: today if played, else yesterday if played, else streak is 0.
  let cursor = new Date(todayStr + 'T00:00:00Z');
  if (!played.has(todayStr)) {
    cursor = new Date(cursor.getTime() - DAY);
    if (!played.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  while (played.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parse(s) {
  if (!s) return null;
  try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; }
}

// ── Daily reminder send ──────────────────────────────────────────────────────
// Designed to be pinged HOURLY (Vercel Hobby crons only run daily, so use a free
// external scheduler like cron-job.org). Each run emails opted-in users for whom
// it's ~REMIND_HOUR locally, who haven't already played or been emailed today.
// Protected by CRON_SECRET. ?test=<email> bypasses the hour check for one user.
const REMIND_HOUR = 7; // 7am local

async function handleRemind(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const testEmail = req.query?.test ? normEmail(req.query.test) : null;

  // Collect all user keys.
  let cursor = '0';
  const keys = [];
  do {
    const r = await redis(['SCAN', cursor, 'MATCH', 'auth:user:*', 'COUNT', '200']);
    cursor = r?.result?.[0] || '0';
    keys.push(...(r?.result?.[1] || []));
  } while (cursor !== '0');

  let sent = 0, skipped = 0, failed = 0;
  for (const key of keys) {
    const user = parse((await redis(['GET', key]))?.result);
    if (!user?.email) { skipped++; continue; }
    if (testEmail && user.email !== testEmail) { skipped++; continue; }
    if (!user.remind) { skipped++; continue; }

    const tz = user.tz || 'Europe/London';
    const todayLocal = localDate(tz);
    if (!testEmail) {
      const h = localHour(tz);
      // Send in a 7–10am LOCAL window (not just exactly 7) so a single missed/
      // jittered hourly tick from the free scheduler doesn't skip the day.
      if (h === null || h < REMIND_HOUR || h >= REMIND_HOUR + 4) { skipped++; continue; }
      // One email per day — this is what actually prevents duplicates across the
      // 4-hour window.
      if (user.lastReminded === todayLocal) { skipped++; continue; }
      // NOTE: we deliberately do NOT skip people who've already played. It's a
      // simple daily reminder; opting out = unsubscribe.
    }

    try {
      await sendReminderEmail(user);
      user.lastReminded = todayLocal;
      await redis(['SET', key, JSON.stringify(user)]);
      sent++;
    } catch { failed++; }
  }
  return res.status(200).json({ ok: true, candidates: keys.length, sent, skipped, failed });
}

async function handleUnsubscribe(req, res) {
  const email = normEmail(req.query?.e);
  const key = String(req.query?.k || '');
  const page = (msg) => res.setHeader('Content-Type', 'text/html').status(200).send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Georgia,serif;max-width:460px;margin:80px auto;text-align:center;color:#222;padding:0 20px"><div style="font-size:34px;font-weight:900;letter-spacing:-.02em">HEADLINES</div><p style="font-size:16px;line-height:1.5;color:#444">${msg}</p><a href="https://www.headlines.games" style="color:#1a7c3a">Back to today's puzzle →</a></div>`
  );
  if (!email) return page('Invalid unsubscribe link.');
  const user = parse((await redis(['GET', `auth:user:${email}`]))?.result);
  if (!user || !user.unsub || user.unsub !== key) return page('This unsubscribe link is invalid or has expired.');
  user.remind = false;
  await redis(['SET', `auth:user:${email}`, JSON.stringify(user)]);
  return page("You're unsubscribed from daily reminders. You'll still keep your streak and stats. We just won't email you each day.");
}

function localHour(tz) {
  try { return parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }), 10); }
  catch { return null; }
}
function localDate(tz) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p; // en-CA gives YYYY-MM-DD
  } catch { return new Date().toISOString().slice(0, 10); }
}

async function sendReminderEmail(user) {
  const unsubUrl = `https://www.headlines.games/api/auth?action=unsubscribe&e=${encodeURIComponent(user.email)}&k=${user.unsub}`;
  const streak = deriveStreak(user.weekly);
  const streakLine = streak >= 2 ? `You're on a ${streak}-day streak. Keep it alive.` : `A fresh set of five headlines is waiting.`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [user.email],
      subject: `Today's Headlines is ready 📰`,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      html: reminderHtml(streak, streakLine, unsubUrl),
      text: `Good morning!\n\n${streakLine}\n\nGuess the year from five real historical headlines. Play today's edition: https://www.headlines.games\n\nHeadlines\n\nDon't want these? Unsubscribe: ${unsubUrl}`,
    }),
  });
  if (!r.ok) throw new Error(`reminder send ${r.status}`);
}

// Newspaper-masthead HTML email. Inline styles + system serif fonts so it renders
// consistently across mail clients (web fonts are unreliable in email).
function reminderHtml(streak, streakLine, unsubUrl) {
  const serif = "Georgia, 'Times New Roman', Times, serif";
  const streakBadge = streak >= 2
    ? `<div style="font-family:${serif};font-size:15px;color:#b8860b;font-weight:bold;margin:0 0 6px;">🔥 ${streak}-day streak</div>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;">
  <div style="max-width:480px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #e3ddcf;border-radius:6px;overflow:hidden;">
      <div style="padding:26px 28px 22px;text-align:center;border-bottom:3px double #121212;">
        <div style="font-family:${serif};font-size:34px;font-weight:900;letter-spacing:-1px;color:#121212;line-height:1;">HEADLINES</div>
        <div style="font-family:${serif};font-size:12px;font-style:italic;color:#777;margin-top:6px;letter-spacing:.5px;">THE DAILY GUESS-THE-YEAR GAME</div>
      </div>
      <div style="padding:30px 28px 26px;text-align:center;">
        ${streakBadge}
        <div style="font-family:${serif};font-size:22px;font-weight:bold;color:#121212;margin:0 0 10px;">Good morning ☕</div>
        <div style="font-family:${serif};font-size:16px;color:#444;line-height:1.5;margin:0 0 24px;">
          ${streakLine}<br/>Five real historical headlines. Can you guess the year of each?
        </div>
        <a href="https://www.headlines.games" style="display:inline-block;background:#121212;color:#ffffff;font-family:${serif};font-size:17px;font-weight:bold;text-decoration:none;padding:14px 34px;border-radius:8px;">
          Play today's edition  →
        </a>
        <div style="font-family:${serif};font-size:13px;color:#999;margin-top:22px;">www.headlines.games</div>
      </div>
    </div>
    <div style="font-family:${serif};font-size:12px;color:#aaa;text-align:center;margin-top:18px;line-height:1.6;">
      You're getting this because you asked for a daily nudge.<br/>
      <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a> · you'll keep your streak &amp; stats either way.
    </div>
  </div>
  </body></html>`;
}

async function sendCodeEmail(email, code) {
  if (!RESEND_API_KEY) throw new Error('Email not configured');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: `${code} is your Headlines sign-in code`,
      html: codeHtml(code),
      text: `Your Headlines sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.\n\nHeadlines · www.headlines.games`,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Could not send the code email (${r.status})`);
  }
}

// Branded sign-in code email — same newspaper masthead as the reminder.
function codeHtml(code) {
  const serif = "Georgia, 'Times New Roman', Times, serif";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;">
  <div style="max-width:480px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #e3ddcf;border-radius:6px;overflow:hidden;">
      <div style="padding:26px 28px 22px;text-align:center;border-bottom:3px double #121212;">
        <div style="font-family:${serif};font-size:34px;font-weight:900;letter-spacing:-1px;color:#121212;line-height:1;">HEADLINES</div>
        <div style="font-family:${serif};font-size:12px;font-style:italic;color:#777;margin-top:6px;letter-spacing:.5px;">THE DAILY GUESS-THE-YEAR GAME</div>
      </div>
      <div style="padding:30px 28px 28px;text-align:center;">
        <div style="font-family:${serif};font-size:18px;color:#444;margin:0 0 18px;">Your sign-in code</div>
        <div style="font-family:${serif};font-size:40px;font-weight:bold;letter-spacing:10px;color:#121212;background:#f4f1ea;border:1px solid #e3ddcf;border-radius:8px;padding:16px 0;margin:0 0 18px;">${code}</div>
        <div style="font-family:${serif};font-size:14px;color:#777;line-height:1.5;">
          Enter it in the app to sign in. It expires in 10 minutes.<br/>If you didn't request this, you can ignore this email.
        </div>
      </div>
    </div>
    <div style="font-family:${serif};font-size:12px;color:#aaa;text-align:center;margin-top:18px;">www.headlines.games</div>
  </div>
  </body></html>`;
}

// Single Upstash REST command: POST the command array to the base URL.
async function redis(command) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return r.json();
}
