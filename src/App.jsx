import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ── PRACTICE MODE CATEGORIES ─────────────────────────────────────────────────
// Dad's final 6-category set. The `data` key is what gets sent to
// /api/practice-headlines; the server has an alias map (CATEGORY_FILTERS)
// that translates these into the actual category strings stored against each
// headline (including every legacy generator scheme — Pop Culture,
// Politics/World Events, Science/Tech, Crime/Scandal/Disaster, etc.).
const PRACTICE_CATEGORIES = [
  { label: "Sport",                data: "Sport" },
  { label: "Arts & Culture",       data: "Arts & Culture" },
  { label: "Politics & World",     data: "Politics & World" },
  { label: "Disasters & Conflict", data: "Disasters & Conflict" },
  { label: "Business & Money",     data: "Business & Money" },
  { label: "Science & Tech",       data: "Science & Tech" },
];

// Decades shown in the practice picker. Earlier decades may be empty depending
// on what's been generated — the picker hides decades with zero headlines.
const PRACTICE_DECADES = [1900,1910,1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020];

// ── SEED HEADLINES (first 7 days guaranteed, diverse eras & publications) ────
const SEED_HEADLINES = [
  { id: "s1",  text: "MAN WALKS ON MOON; 'ONE GIANT LEAP FOR MANKIND'", year: 1969, publication: "The New York Times", pubColor: "#1a1a1a", context: "Neil Armstrong became the first human to walk on the Moon on July 20, 1969. An estimated 600 million people — one fifth of humanity — watched the broadcast live.", hint: "WOODSTOCK FESTIVAL DRAWS 400,000 TO A NEW YORK DAIRY FARM" },
  { id: "s2",  text: "BERLIN WALL FALLS; EAST GERMANY OPENS ALL BORDERS", year: 1989, publication: "Der Spiegel", pubColor: "#1a1a1a", context: "After 28 years dividing a city and a continent, the Berlin Wall fell on November 9, 1989. Within hours, jubilant crowds began dismantling it with hammers.", hint: "TIANANMEN SQUARE UPRISING CRUSHED BY TANKS IN BEIJING" },
  { id: "s3",  text: "TITANIC FOUNDERED AT 2:20 A.M.; 1,500 TO 1,800 DEAD", year: 1912, publication: "The New York Times", pubColor: "#1a1a1a", context: "The RMS Titanic sank in the North Atlantic on April 15, 1912, after striking an iceberg on her maiden voyage.", hint: "LAST QING EMPEROR ABDICATES AS CHINA BECOMES A REPUBLIC" },
  { id: "s4",  text: "CHERNOBYL REACTOR EXPLODES; RADIOACTIVE CLOUD ENGULFS CONTINENT", year: 1986, publication: "The Guardian", pubColor: "#0a4a7c", context: "Reactor No. 4 at the Chernobyl nuclear plant exploded on April 26, 1986, releasing 400 times more radiation than the Hiroshima bomb.", hint: "SPACE SHUTTLE CHALLENGER EXPLODES SECONDS AFTER LAUNCH" },
  { id: "s5",  text: "LEHMAN BROTHERS COLLAPSES IN LARGEST BANKRUPTCY IN HISTORY", year: 2008, publication: "Financial Times", pubColor: "#c8500a", context: "Lehman Brothers filed for Chapter 11 bankruptcy on September 15, 2008, triggering the worst global financial crisis since the Great Depression.", hint: "BARACK OBAMA ELECTED FIRST BLACK U.S. PRESIDENT" },
  { id: "s6",  text: "WORLD HEALTH ORGANISATION DECLARES GLOBAL PANDEMIC", year: 2020, publication: "The Guardian", pubColor: "#0a4a7c", context: "The WHO declared COVID-19 a global pandemic on March 11, 2020. It would go on to cause over 7 million confirmed deaths worldwide." },
  { id: "s7",  text: "NELSON MANDELA WALKS FREE AFTER 27 YEARS IN PRISON", year: 1990, publication: "The Guardian", pubColor: "#0a4a7c", context: "Nelson Mandela was released from Victor Verster Prison on February 11, 1990, marking the beginning of the end of apartheid in South Africa." },
  { id: "s8",  text: "ALLIES LAND IN FRANCE; GREAT INVASION IS ON", year: 1944, publication: "Chicago Tribune", pubColor: "#1a1a1a", context: "D-Day — June 6, 1944 — saw 156,000 Allied troops storm the beaches of Normandy in the largest seaborne invasion in history." },
  { id: "s9",  text: "SOVIET UNION CEASES TO EXIST; GORBACHEV RESIGNS", year: 1991, publication: "Washington Post", pubColor: "#1a1a1a", context: "On December 25, 1991, Mikhail Gorbachev resigned and the USSR formally ceased to exist. Fifteen independent nations emerged overnight." },
  { id: "s10", text: "YURI GAGARIN BECOMES FIRST HUMAN IN SPACE", year: 1961, publication: "The Times", pubColor: "#8b1a1a", context: "Soviet cosmonaut Yuri Gagarin completed one orbit of Earth on April 12, 1961. The flight lasted 108 minutes." },
  { id: "s11", text: "FIRST SUCCESSFUL POWERED AEROPLANE FLIGHT ACHIEVED", year: 1903, publication: "The Daily Telegraph", pubColor: "#1a1a1a", context: "The Wright Brothers made the first sustained powered flight at Kitty Hawk on December 17, 1903. The longest flight lasted 59 seconds." },
  { id: "s13", text: "SCIENTISTS CONFIRM DETECTION OF GRAVITATIONAL WAVES", year: 2016, publication: "The Daily Telegraph", pubColor: "#1a1a1a", context: "On February 11, 2016, LIGO confirmed the first detection of gravitational waves — predicted by Einstein exactly 100 years earlier." },
  { id: "s14", text: "INDIA GAINS INDEPENDENCE; NEHRU SPEAKS AT MIDNIGHT", year: 1947, publication: "The Hindu", pubColor: "#1a1a1a", context: "India gained independence from British rule at midnight on August 15, 1947. Nehru's 'Tryst with Destiny' speech remains one of the great addresses of the 20th century." },
  { id: "s15", text: "TECH GIANT UNVEILS DEVICE COMBINING PHONE, MUSIC PLAYER AND INTERNET", year: 2007, publication: "Financial Times", pubColor: "#c8500a", context: "Steve Jobs unveiled the original iPhone at Macworld on January 9, 2007. It changed personal computing forever." },
  { id: "s16", text: "JAPAN SURRENDERS; WAR OVER", year: 1945, publication: "Daily Mirror", pubColor: "#1a1a1a", context: "Japan's formal surrender on September 2, 1945 ended the Second World War — the deadliest conflict in human history." },
  { id: "s17", text: "SMALLPOX ERADICATED; WORLD HEALTH ORGANISATION DECLARES VICTORY", year: 1980, publication: "The Times", pubColor: "#8b1a1a", context: "The WHO declared smallpox eradicated on May 8, 1980 — the first and only infectious disease ever wiped out by human effort." },
  { id: "s18", text: "FIRST HUMAN HEART TRANSPLANT PERFORMED; PATIENT ALIVE", year: 1967, publication: "Daily Mirror", pubColor: "#1a1a1a", context: "Surgeon Christiaan Barnard performed the world's first heart transplant in Cape Town on December 3, 1967." },
  { id: "s19", text: "DIANA, PRINCESS OF WALES, KILLED IN PARIS CAR CRASH", year: 1997, publication: "The Times", pubColor: "#8b1a1a", context: "Diana died in the early hours of August 31, 1997, following a crash in the Pont de l'Alma tunnel in Paris." },
  { id: "s20", text: "QUEEN ELIZABETH II, BRITAIN'S LONGEST-REIGNING MONARCH, DIES AGED 96", year: 2022, publication: "The Daily Telegraph", pubColor: "#1a1a1a", context: "Queen Elizabeth II died at Balmoral on September 8, 2022, after 70 years on the throne." },
  { id: "s21", text: "APARTHEID ENDS; SOUTH AFRICA HOLDS FIRST FREE ELECTION", year: 1994, publication: "The Guardian", pubColor: "#0a4a7c", context: "South Africa held its first fully democratic election on April 27, 1994. Mandela became president on May 10." },
  { id: "s22", text: "INTERNET OPENS TO PUBLIC AS WORLD WIDE WEB GOES LIVE", year: 1991, publication: "The Guardian", pubColor: "#0a4a7c", context: "Tim Berners-Lee made the World Wide Web publicly available on August 6, 1991 — a network that would transform every aspect of human life." },
  { id: "s23", text: "CHATGPT REACHES ONE MILLION USERS IN FIVE DAYS", year: 2022, publication: "Financial Times", pubColor: "#c8500a", context: "OpenAI's ChatGPT reached one million users within five days of launch on November 30, 2022 — faster than any consumer product in history." },
  { id: "s24", text: "RUSSIA INVADES UKRAINE IN FULL-SCALE ASSAULT", year: 2022, publication: "The Guardian", pubColor: "#0a4a7c", context: "Russia launched a full-scale invasion of Ukraine on February 24, 2022 — the largest land war in Europe since 1945." },
  { id: "s25", text: "WALL STREET IN PANIC AS STOCKS COLLAPSE; BILLIONS LOST", year: 1929, publication: "The New York Times", pubColor: "#1a1a1a", context: "The Wall Street Crash of October 1929 triggered the Great Depression — a decade of global economic hardship." },
  { id: "s26", text: "BLACK MONDAY: DOW DROPS 508 POINTS IN WORST SINGLE-DAY COLLAPSE", year: 1987, publication: "Financial Times", pubColor: "#c8500a", context: "On October 19, 1987, the Dow Jones lost 22.6% of its value in a single session — the largest one-day percentage decline in its history." },
  { id: "s27", text: "GANDHI SHOT DEAD AT PRAYER MEETING IN NEW DELHI", year: 1948, publication: "The Hindu", pubColor: "#1a1a1a", context: "Mahatma Gandhi was assassinated on January 30, 1948, by Nathuram Godse at a prayer meeting in New Delhi." },
  { id: "s28", text: "ROGER BANNISTER RUNS FIRST FOUR-MINUTE MILE", year: 1954, publication: "The Times", pubColor: "#8b1a1a", context: "Roger Bannister ran the first sub-four-minute mile at Oxford on May 6, 1954, clocking 3:59.4." },
  { id: "s29", text: "MUHAMMAD ALI DEFEATS GEORGE FOREMAN IN 'RUMBLE IN THE JUNGLE'", year: 1974, publication: "The New York Times", pubColor: "#1a1a1a", context: "Ali knocked out Foreman in the eighth round in Kinshasa, Zaire on October 30, 1974, regaining the world heavyweight title." },
  { id: "s30", text: "POPE FRANCIS DIES AT 88; FIRST LATIN AMERICAN PONTIFF", year: 2025, publication: "La Repubblica", pubColor: "#1a1a1a", context: "Pope Francis died on April 21, 2025, at the age of 88, after 12 years as head of the Roman Catholic Church." },
  { id: "s31", text: "DEEPSEEK AI SHOCKS SILICON VALLEY WITH LOW-COST BREAKTHROUGH", year: 2025, publication: "Financial Times", pubColor: "#c8500a", context: "DeepSeek released its R1 model in January 2025, matching U.S. AI systems at a fraction of the cost, sending shockwaves through tech stocks." },
  { id: "s32", text: "HUMAN GENOME FULLY MAPPED IN LANDMARK OF SCIENCE", year: 2003, publication: "The Guardian", pubColor: "#0a4a7c", context: "Scientists completed the Human Genome Project on April 14, 2003 — two years ahead of schedule." },
  { id: "s33", text: "PEACE IN NORTHERN IRELAND AS GOOD FRIDAY AGREEMENT IS SIGNED", year: 1998, publication: "The Irish Times", pubColor: "#1a1a1a", context: "The Good Friday Agreement was signed on April 10, 1998, ending three decades of conflict that claimed 3,500 lives." },
  { id: "s34", text: "JESSE OWENS WINS FOUR GOLD MEDALS AT BERLIN OLYMPICS", year: 1936, publication: "Chicago Tribune", pubColor: "#1a1a1a", context: "Jesse Owens won four gold medals at the 1936 Berlin Olympics, directly contradicting Hitler's theory of Aryan superiority." },
  { id: "s35", text: "HONG KONG HANDED BACK TO CHINA; END OF BRITISH RULE", year: 1997, publication: "South China Morning Post", pubColor: "#1a1a1a", context: "Britain handed Hong Kong back to China at midnight on July 1, 1997, ending 156 years of colonial rule." },
];

// ── STORAGE HELPERS ──────────────────────────────────────────────────────────
// NOTE: storage keys are versioned. Bumping the suffix invalidates any stale
// caches in existing browsers (e.g. after an outage that cached seed fallbacks).
const STORAGE_KEYS = {
  USED_IDS:       "hl_used_ids",
  POOL:           "hl_pool",
  // TODAY_DATE is the headline-cache freshness marker — written by
  // getDailyHeadlines whenever a fresh batch is fetched. Do NOT use it as a
  // "user played today" check, since just opening the app on a new day
  // rewrites it.
  TODAY_DATE:     "hl_today_date_v2",
  TODAY_HEADLINES:"hl_today_headlines_v2",
  // PLAY_DATE is the "the player actually has saved guesses for this date"
  // marker — written only by the persistence effect (which fires once the
  // user has left the intro screen). validSave reads this, not TODAY_DATE.
  PLAY_DATE:      "hl_play_date_v1",
  // Headlines the player has actually locked guesses against. Saved every
  // render of the daily session so the scorecard always renders against the
  // headlines the player saw at lock time — even if a later page reload
  // would otherwise refetch a different set (e.g. after a seed fallback).
  PLAYED_HEADLINES:"hl_played_headlines_v1",
  // Timestamp of the player's most recent in-session activity (lock/advance
  // while activeSession=true). If a remount happens within ACTIVE_WINDOW_MS
  // of this timestamp, we restore activeSession=true so the player isn't
  // bounced to the resume screen mid-game by an iOS Safari tab teardown.
  ACTIVE_PLAY_AT: "hl_active_play_at_v1",
  STREAK:         "hl_streak",
  LAST_PLAYED:    "hl_last_played",
  WEEKLY:         "hl_weekly_v1",
  OBSCURE_FLAGS:  "hl_obscure_flags_v1",
};

// Display-only rescale. Internally scores stay 0–1000 per question / 0–5000 total
// so the leaderboard (validated 0–5000 server-side) and existing localStorage
// saves keep working. Mum's mental model: 100 years, 100 points per headline.
function displayScore(s) {
  return Math.round((s || 0) / 10);
}

// ── SOUND ────────────────────────────────────────────────────────────────────
// Light Web Audio tones tied to score bands. Programmatic so we don't bundle
// audio files. iOS Safari + Chrome require a user gesture to create or resume
// an AudioContext — we lazily create on first call (which always happens
// inside a click handler) and resume if suspended.
let _audioCtx = null;
function getAudioCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) {
    try { _audioCtx = new AC(); } catch { return null; }
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

function isSoundOn() {
  const v = getStorage("hl_sound_v1", true);
  return v !== false;
}

function playTone(freq, durationSec, gain = 0.05, type = "sine") {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Quick attack, exponential decay → "bell" envelope
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationSec + 0.02);
}

function playSequence(notes) {
  // notes: [{ freq, delay (ms), duration (sec), gain }]
  for (const n of notes) {
    setTimeout(() => playTone(n.freq, n.duration, n.gain ?? 0.05), n.delay);
  }
}

// Sound on lock — graded by underlying score (0–1000).
function playScoreSound(score) {
  if (!isSoundOn()) return;
  if (score >= 900) {
    // Bright bell — exact / near-exact ("ding!")
    playSequence([
      { freq: 1318, delay: 0,  duration: 0.5, gain: 0.06 }, // E6
      { freq: 1760, delay: 80, duration: 0.6, gain: 0.05 }, // A6
    ]);
  } else if (score >= 600) {
    // Pleasant 2-note up — close miss
    playSequence([
      { freq: 659,  delay: 0,   duration: 0.18, gain: 0.05 }, // E5
      { freq: 988,  delay: 110, duration: 0.3,  gain: 0.05 }, // B5
    ]);
  } else if (score >= 300) {
    // Neutral single tone — mid
    playTone(523, 0.25, 0.045); // C5
  } else {
    // Low descending — wide miss
    playSequence([
      { freq: 349, delay: 0,   duration: 0.2, gain: 0.045 }, // F4
      { freq: 233, delay: 140, duration: 0.35, gain: 0.045 }, // A#3
    ]);
  }
}

// Sound on final results — graded by avg per question (0–1000).
function playFinalSound(avg) {
  if (!isSoundOn()) return;
  if (avg >= 750) {
    // Fanfare — 4-note ascending major triad + octave
    playSequence([
      { freq: 523,  delay: 0,   duration: 0.18, gain: 0.07 }, // C5
      { freq: 659,  delay: 130, duration: 0.18, gain: 0.07 }, // E5
      { freq: 784,  delay: 260, duration: 0.18, gain: 0.07 }, // G5
      { freq: 1047, delay: 390, duration: 0.5,  gain: 0.07 }, // C6
    ]);
  } else if (avg >= 400) {
    // Pleasant 3-note up
    playSequence([
      { freq: 392, delay: 0,   duration: 0.18, gain: 0.06 }, // G4
      { freq: 523, delay: 130, duration: 0.18, gain: 0.06 }, // C5
      { freq: 659, delay: 260, duration: 0.35, gain: 0.06 }, // E5
    ]);
  } else {
    // Modest 2-note resolution
    playSequence([
      { freq: 440, delay: 0,   duration: 0.18, gain: 0.05 }, // A4
      { freq: 349, delay: 140, duration: 0.35, gain: 0.05 }, // F4
    ]);
  }
}

function getPlayerUUID() {
  const key = 'hl_uuid';
  let uuid = null;
  try { uuid = localStorage.getItem(key); } catch {}
  if (!uuid) {
    uuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    try { localStorage.setItem(key, uuid); } catch {}
  }
  return uuid;
}

function getStorage(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function setStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getWeeklyHistory() {
  const raw = getStorage(STORAGE_KEYS.WEEKLY, []);
  return Array.isArray(raw) ? raw : [];
}

function pushDailyHistory(date, score, guesses, hints) {
  const hist = getWeeklyHistory();
  const filtered = hist.filter(e => e.date !== date);
  const entry = { date, score };
  // Store the per-question guesses too, so the full results breakdown can be
  // rebuilt on any device the player signs in on (the answers/headlines are the
  // shared daily edition, so guesses + that edition = the full result).
  if (Array.isArray(guesses) && guesses.length) entry.guesses = guesses;
  // Only persist hints when at least one was used, so most entries stay tiny.
  // Needed so a hinted game's per-question scores rebuild correctly cross-device.
  if (Array.isArray(hints) && hints.some(Boolean)) entry.hints = hints;
  filtered.push(entry);
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  // Retain up to ~1 year so the results chart can offer W / M / 6M / Y ranges.
  // Each entry is tiny ({date, score, guesses?}), so this is a few KB at most.
  setStorage(STORAGE_KEYS.WEEKLY, filtered.slice(-370));
}

// Current streak = consecutive days played ending today (or yesterday — still
// "alive" if you played yesterday but haven't played today yet). Derived from
// the local play history; mirrors the server's deriveStreak so they agree.
function deriveStreakLocal(weekly) {
  const played = new Set((weekly || []).map(e => e.date));
  if (played.size === 0) return 0;
  const DAY = 86_400_000;
  const todayStr = new Date().toISOString().slice(0, 10);
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

// Merge a server play-history into local storage (union by date, highest score).
function mergeWeeklyIntoLocal(serverWeekly) {
  if (!Array.isArray(serverWeekly) || serverWeekly.length === 0) return;
  const byDate = new Map();
  for (const e of [...getWeeklyHistory(), ...serverWeekly]) {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const prev = byDate.get(e.date);
    const score = Number(e.score) || 0;
    if (!prev || score > prev.score) byDate.set(e.date, { date: e.date, score });
  }
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-370);
  setStorage(STORAGE_KEYS.WEEKLY, merged);
}

// Cross-browser clipboard copy. Tries the async Clipboard API first, then the
// legacy execCommand path (needed on some Firefox/Linux setups where the async
// API is missing or blocked). Returns true if the text made it to the clipboard.
async function robustCopy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch {}
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {}
  return false;
}

// ── Auth client (email → 6-digit code → session cookie) ─────────────────────
const auth = {
  async me() {
    try { const r = await fetch('/api/auth?action=me', { method: 'POST' }); return await r.json(); }
    catch { return { user: null }; }
  },
  async request(email) {
    const r = await fetch('/api/auth?action=request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not send the code');
    return d;
  },
  async verify(email, code, migrate, remind, name) {
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    const r = await fetch('/api/auth?action=verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, migrate, tz, remind, name }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'That code did not work');
    return d;
  },
  async sync(weekly, opts) {
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    try {
      const r = await fetch('/api/auth?action=sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly, tz, ...(opts || {}) }),
      });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  },
  async logout() {
    try { await fetch('/api/auth?action=logout', { method: 'POST' }); } catch {}
  },
};

function BurgerButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open menu"
      style={{
        position: "absolute",
        top: 18,
        left: 12,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        zIndex: 10,
        fontFamily: "'Source Serif 4', serif",
        fontSize: 14,
        color: "#121212",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 18, height: 2, background: "#121212", borderRadius: 1 }} />
        ))}
      </div>
      <span>Menu</span>
    </button>
  );
}

function MenuOverlay({ open, onClose, onPickToday, onPickByDecade, onPickByCategory, onPickRecent, onPickFeedback, currentMode, currentLabel, soundOn, onToggleSound, extrasLocked, account, onSignIn, onSignOut }) {
  if (!open) return null;
  const item = {
    width: "100%",
    padding: "16px 20px",
    background: "#fff",
    border: "1px solid #e0e0e0",
    fontFamily: "'Source Serif 4', serif",
    fontSize: 15,
    color: "#121212",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: -1,
  };
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(420px, 92vw)", background: "#fff", borderRadius: 4, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 18, color: "#121212" }}>HEADLINES</div>
          <button onClick={onClose} aria-label="Close menu" style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#555", padding: 4 }}>✕</button>
        </div>
        {currentMode === "practice" && currentLabel && (
          <div style={{ padding: "10px 20px", background: "#f7f7f7", fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#666", fontStyle: "italic", borderBottom: "1px solid #e0e0e0" }}>
            Currently playing: <strong style={{ color: "#121212", fontStyle: "normal" }}>{currentLabel}</strong>
          </div>
        )}
        <button style={item} onClick={onPickToday}>
          <span>🗞️&nbsp;&nbsp;Today's edition</span>
          {currentMode === "daily" && <span style={{ fontSize: 11, color: "#1a7c3a" }}>● active</span>}
        </button>
        <button style={item} onClick={onPickByDecade}>
          <span>📅&nbsp;&nbsp;Play by decade</span>
          <span style={{ fontSize: 14, color: "#888" }}>{extrasLocked ? "🔒" : "›"}</span>
        </button>
        <button style={item} onClick={onPickByCategory}>
          <span>🎭&nbsp;&nbsp;Play by category</span>
          <span style={{ fontSize: 14, color: "#888" }}>{extrasLocked ? "🔒" : "›"}</span>
        </button>
        <button style={item} onClick={onPickRecent}>
          <span>🗓️&nbsp;&nbsp;Recent editions</span>
          <span style={{ fontSize: 14, color: "#888" }}>{extrasLocked ? "🔒" : "›"}</span>
        </button>
        <button style={item} onClick={onPickFeedback}>
          <span>💬&nbsp;&nbsp;Send feedback</span>
          <span style={{ fontSize: 18, color: "#666" }}>›</span>
        </button>
        <button style={item} onClick={onToggleSound}>
          <span>{soundOn ? "🔊" : "🔇"}&nbsp;&nbsp;Sound</span>
          <span style={{ fontSize: 12, color: soundOn ? "#1a7c3a" : "#888", fontWeight: 600 }}>{soundOn ? "ON" : "OFF"}</span>
        </button>
        {account ? (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12.5, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Signed in as <strong style={{ color: "#121212" }}>{account.email}</strong>
            </span>
            <button onClick={onSignOut} style={{ background: "none", border: "none", color: "#1a7c3a", textDecoration: "underline", cursor: "pointer", fontFamily: "'Source Serif 4', serif", fontSize: 12.5, flexShrink: 0 }}>Sign out</button>
          </div>
        ) : (
          <button style={item} onClick={onSignIn}>
            <span>👤&nbsp;&nbsp;Sign in / create account</span>
            <span style={{ fontSize: 18, color: "#666" }}>›</span>
          </button>
        )}
      </div>
    </div>
  );
}

function PracticePicker({ mode, manifest, onPick, onBack }) {
  if (!manifest) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60 }}>
        <div style={{ width: "min(420px, 92vw)", background: "#fff", padding: 30, textAlign: "center", borderRadius: 4 }}>
          <div className="spin" style={{ marginRight: 8 }}>◌</div>
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555" }}>Loading practice library…</span>
        </div>
      </div>
    );
  }
  // "Recent editions" lists past daily editions with a ✓ on ones already
  // played (from local weekly history). Other modes list decades/categories.
  const playedDates = mode === "recent"
    ? new Set(getWeeklyHistory().map(e => e.date))
    : null;
  const items = mode === "decade"
    ? PRACTICE_DECADES
        .map(d => ({ value: String(d), label: `${d}s`, count: manifest.decades?.[d] || 0 }))
        .filter(x => x.count > 0)
    : mode === "category"
    ? PRACTICE_CATEGORIES
        .map(c => ({ value: c.data, label: c.label, count: manifest.categories?.[c.data] || 0 }))
        .filter(x => x.count > 0)
    : (manifest.recentDates || []).map(d => ({
        value: d,
        label: formatEditionDate(d),
        count: 5, // recentDates only includes days with a full edition
        played: playedDates.has(d),
      }));

  const title = mode === "decade" ? "Pick a decade" : mode === "category" ? "Pick a category" : "Recent editions";
  const emptyNote = mode === "recent"
    ? "No past editions to catch up on yet."
    : `No headlines cached yet for any ${mode === "decade" ? "decade" : "category"}.`;

  return (
    <div onClick={onBack} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60,
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(420px, 92vw)", maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: 4, boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555", cursor: "pointer", padding: 0 }}>← Back</button>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 16, color: "#121212" }}>
            {title}
          </div>
          <div style={{ width: 50 }} />
        </div>
        {items.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555" }}>
            {emptyNote}
          </div>
        ) : items.map(it => (
          <button
            key={it.value}
            onClick={() => onPick(mode === "recent" ? "date" : mode, it.value, it.label)}
            disabled={it.count < 5}
            title={it.count < 5 ? `Only ${it.count} headlines yet — need 5 to play a round` : ""}
            style={{
              width: "100%",
              padding: "16px 20px",
              background: "#fff",
              border: "none",
              borderTop: "1px solid #f0f0f0",
              fontFamily: "'Source Serif 4', serif",
              fontSize: 15,
              color: it.count < 5 ? "#ccc" : "#121212",
              cursor: it.count < 5 ? "default" : "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{it.label}</span>
            {mode === "recent" ? (
              <span style={{ fontSize: 12, color: it.played ? "#1a7c3a" : "#bbb" }}>
                {it.played ? "✓ played" : "not played"}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: it.count < 5 ? "#ddd" : "#888" }}>
                {it.count} {it.count === 1 ? "headline" : "headlines"}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewspaperIcon({ size = 28, color = "#121212" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
      <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14zM6 7h8v2H6V7zm0 4h8v2H6v-2zm0 4h5v2H6v-2zm10-8h2v10h-2V7z"/>
    </svg>
  );
}

// Apple-Health-style score history with a W / M / 6M / Y range toggle. Short
// ranges show daily bars; longer ranges aggregate to weekly / monthly averages
// (mirroring how Health rolls up its bars). Dense ranges scroll horizontally,
// auto-parked at the most recent bar. Data comes from the same local play
// history that powers streaks; it fills out as players build a back-catalogue.
const HISTORY_MAX_DISPLAY = 500;
const HISTORY_BAR_AREA = 46; // px height of the plotting area the bars grow into
const HISTORY_RANGES = [
  { key: "W",  label: "W",  title: "Your last 7 days",  days: 7,   bucket: "day" },
  { key: "M",  label: "M",  title: "Last 30 days",      days: 30,  bucket: "day" },
  { key: "6M", label: "6M", title: "Last 6 months",     days: 182, bucket: "week" },
  { key: "Y",  label: "Y",  title: "Last year",         days: 365, bucket: "month" },
];

function fmtLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildHistoryBuckets(range, byDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const avg = (vals) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null);
  const buckets = [];
  if (range.bucket === "day") {
    for (let i = range.days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const score = byDate.has(fmtLocalDate(d)) ? byDate.get(fmtLocalDate(d)) : null;
      buckets.push({
        key: fmtLocalDate(d),
        score,
        label: range.days <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1)
          : String(d.getDate()),
      });
    }
  } else if (range.bucket === "week") {
    const weeks = Math.round(range.days / 7);
    for (let w = weeks - 1; w >= 0; w--) {
      const end = new Date(today);
      end.setDate(end.getDate() - 7 * w);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const vals = [];
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const s = byDate.get(fmtLocalDate(d));
        if (s != null) vals.push(s);
      }
      buckets.push({ key: fmtLocalDate(start), score: avg(vals), label: `${start.getDate()}/${start.getMonth() + 1}` });
    }
  } else {
    for (let m = 11; m >= 0; m--) {
      const ref = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const y = ref.getFullYear(), mo = ref.getMonth();
      const vals = [];
      for (const [date, s] of byDate) {
        const dd = new Date(date + "T00:00:00");
        if (dd.getFullYear() === y && dd.getMonth() === mo && s != null) vals.push(s);
      }
      buckets.push({ key: `${y}-${mo}`, score: avg(vals), label: ref.toLocaleDateString("en-US", { month: "short" }).slice(0, 1) });
    }
  }
  return buckets;
}

function ScoreHistory() {
  const [rangeKey, setRangeKey] = useState("W");
  const scrollRef = useRef(null);
  const hist = getWeeklyHistory();

  const byDate = new Map(hist.filter((e) => e && e.date).map((e) => [e.date, displayScore(e.score)]));
  const range = HISTORY_RANGES.find((r) => r.key === rangeKey) || HISTORY_RANGES[0];
  const buckets = buildHistoryBuckets(range, byDate);
  const played = buckets.filter((b) => b.score != null).map((b) => b.score);
  const avg = played.length ? Math.round(played.reduce((a, b) => a + b, 0) / played.length) : 0;

  // Few bars stretch to fill the width; many bars get a fixed width and scroll.
  const fills = buckets.length <= 10;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));

  // Park a scrolling strip at its right edge (most recent) on load / range change.
  useEffect(() => {
    if (!fills && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [rangeKey, fills]);

  // Nothing played yet → render nothing. Placed after all hooks so hook order
  // stays stable across renders (Rules of Hooks).
  if (!hist.some((e) => e && e.score != null)) return null;

  return (
    <div style={{ marginTop: 18, paddingTop: 18, marginBottom: 24, borderTop: "1px solid #e0e0e0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>{range.title}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#555" }}>avg <strong style={{ color: "#121212" }}>{avg}</strong></div>
      </div>

      {/* Range toggle — mirrors Apple Health's D/W/M/6M/Y pill row. */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#f2f0ea", borderRadius: 8, padding: 3 }}>
        {HISTORY_RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            style={{
              flex: 1, padding: "3px 0", border: "none", cursor: "pointer", borderRadius: 6,
              fontFamily: "'Source Serif 4', serif", fontSize: 11.5, fontWeight: r.key === rangeKey ? 700 : 500,
              background: r.key === rangeKey ? "#fff" : "transparent",
              color: r.key === rangeKey ? "#121212" : "#888",
              boxShadow: r.key === rangeKey ? "0 1px 2px rgba(0,0,0,.12)" : "none",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* One scroll container, one column per bucket. Every sub-element has a
          FIXED height (value / bar-area / label) so columns are identical in
          size — that keeps the bar baseline dead straight (labelled columns no
          longer bob) while horizontal scroll still moves bars + labels together. */}
      <div
        ref={scrollRef}
        style={{ display: "flex", gap: fills ? 6 : 5, alignItems: "flex-start", overflowX: fills ? "visible" : "auto", paddingBottom: 2 }}
      >
        {buckets.map((b, i) => {
          const barH = b.score != null ? Math.max(6, (b.score / HISTORY_MAX_DISPLAY) * (HISTORY_BAR_AREA - 2)) : 3;
          // Always label the most-recent bar; show interior labels only when
          // they're at least `labelEvery` away from it, so they never collide.
          const isLast = i === buckets.length - 1;
          const showLabel = isLast || (i % labelEvery === 0 && buckets.length - 1 - i >= labelEvery);
          return (
            <div
              key={b.key}
              style={{ flex: fills ? 1 : "0 0 auto", width: fills ? "auto" : 16, display: "flex", flexDirection: "column", alignItems: "center" }}
            >
              {fills && (
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: b.score != null ? "#121212" : "#ddd", fontWeight: 600, height: 15, lineHeight: "15px" }}>{b.score != null ? b.score : "—"}</div>
              )}
              <div style={{ width: "100%", height: HISTORY_BAR_AREA, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: `${barH}px`, background: b.score != null ? "#121212" : "#ececec", borderRadius: 2 }} />
              </div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 10, color: "#666", height: 12, lineHeight: "12px", marginTop: 5, whiteSpace: "nowrap" }}>{showLabel ? b.label : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ISO 3166-1 alpha-2 -> regional-indicator flag emoji. 'XX'/invalid -> globe.
function countryToFlag(cc) {
  if (typeof cc !== 'string' || !/^[A-Za-z]{2}$/.test(cc) || cc.toUpperCase() === 'XX') return '🌍';
  const up = cc.toUpperCase();
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65);
}

// The daily leaderboard on the results screen. Scrollable slice: a "countries
// playing today" strip, the top few rows, then a window around the player.
// Logged-out players are deliberately "Anonymous" (the blandness nudges
// sign-ups); the player's own row carries the prompt to sign in / add a name.
function Leaderboard({ data, account, onSignIn, onSetName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  if (!data || !Array.isArray(data.top) || data.top.length === 0) return null;

  const serif = "'Source Serif 4', serif";
  const top = data.top;
  const around = Array.isArray(data.around) ? data.around : [];
  const lastTopRank = top[top.length - 1]?.rank || 0;
  const showGap = around.length > 0 && around[0].rank > lastTopRank + 1;
  const countries = Array.isArray(data.countries) ? data.countries : [];

  async function saveName() {
    const v = draft.trim();
    if (!v) { setEditing(false); return; }
    setSaving(true);
    await onSetName?.(v);
    setSaving(false);
    setEditing(false);
  }

  function Row({ row }) {
    const named = row.name && row.name.trim();
    const youAnon = row.isYou && !named;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        background: row.isYou ? "#fdf4e3" : "transparent",
        borderLeft: row.isYou ? "3px solid #b91c1c" : "3px solid transparent",
        fontFamily: serif,
      }}>
        <div style={{ width: 30, textAlign: "right", fontSize: 13, color: "#888", fontVariantNumeric: "tabular-nums" }}>
          {row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}
        </div>
        <div style={{ fontSize: 17, lineHeight: 1, width: 22, textAlign: "center" }}>{countryToFlag(row.country)}</div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: "#121212", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {named ? row.name : "Anonymous"}
          {row.isYou && <span style={{ color: "#b91c1c", fontWeight: 700 }}> (you)</span>}
          {youAnon && (
            <div style={{ fontSize: 11.5, color: "#888", fontStyle: "italic", fontWeight: 400, whiteSpace: "normal" }}>
              {account ? (
                editing ? null : (
                  <span onClick={() => { setDraft(""); setEditing(true); }} style={{ color: "#1a7c3a", textDecoration: "underline", cursor: "pointer" }}>
                    + add your name
                  </span>
                )
              ) : (
                <span onClick={() => onSignIn?.("streak")} style={{ color: "#1a7c3a", textDecoration: "underline", cursor: "pointer" }}>
                  sign in to show your name
                </span>
              )}
            </div>
          )}
          {row.isYou && account && editing && (
            <div style={{ display: "flex", gap: 6, marginTop: 5, whiteSpace: "normal" }}>
              <input
                autoFocus type="text" maxLength={20} placeholder="First name"
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                style={{ flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 13, fontFamily: serif, border: "1.5px solid #ccc", borderRadius: 7 }}
              />
              <button onClick={saveName} disabled={saving} style={{ border: "none", background: "#1a7c3a", color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, fontFamily: serif, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "…" : "Save"}
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#121212", fontVariantNumeric: "tabular-nums" }}>{displayScore(row.score)}</div>
      </div>
    );
  }

  return (
    <div className="in" style={{ border: "1px solid #e3ddcf", borderRadius: 14, overflow: "hidden", marginBottom: 28 }}>
      {/* "You beat X%" headline */}
      {data.percentile != null && data.totalPlayers > 1 && (
        <div style={{ background: "#121212", color: "#fff", padding: "16px 18px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5.5vw,27px)", fontWeight: 900, lineHeight: 1.15 }}>
            You beat <span style={{ color: "#fbbf24" }}>{data.percentile}%</span> of players today
          </div>
        </div>
      )}

      {/* Countries-playing-today strip */}
      {countries.length > 0 && (
        <div style={{ padding: "11px 14px", borderBottom: "1px solid #eee", background: "#f2f2f0", textAlign: "center" }}>
          <div style={{ fontFamily: serif, fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#888", marginBottom: 6 }}>
            Played in {countries.length} {countries.length === 1 ? "country" : "countries"} today
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.5, letterSpacing: 1 }}>
            {countries.slice(0, 24).map(c => countryToFlag(c)).join(" ")}
            {countries.length > 24 && <span style={{ fontSize: 12, color: "#888", fontFamily: serif }}> +{countries.length - 24}</span>}
          </div>
        </div>
      )}

      {/* Board rows */}
      <div style={{ background: "#fff" }}>
        {top.map((row, i) => <Row key={`t${i}`} row={row} />)}
        {showGap && (
          <div style={{ textAlign: "center", color: "#ccc", fontSize: 16, lineHeight: 1, padding: "2px 0" }}>⋯</div>
        )}
        {around.map((row, i) => <Row key={`a${i}`} row={row} />)}
        {/* "More below" signal — the window only shows a couple of rows under the
            player, so without this it reads as "nearly last". Makes the depth of
            the board (and the player's real standing) legible. */}
        {around.length > 0 && data.totalPlayers > around[around.length - 1].rank && (
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 12.5, fontFamily: serif, fontStyle: "italic", padding: "10px 0 12px", borderTop: "1px dotted #eee" }}>
            ⋯ more players below you
          </div>
        )}
      </div>
    </div>
  );
}

// Exact-year magic moment: an editor's red date-stamp slams onto the page when
// the player nails the year. Fixed + pointer-events:none (see .stamp-wrap) so it
// floats on top of the current UI without shifting or covering anything. Keyed
// so each new exact hit restarts the slam animation.
function DateStamp({ year, hitKey }) {
  if (year == null) return null;
  return (
    <div className="stamp-wrap" aria-hidden="true">
      <div className="stamp" key={hitKey}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: "clamp(42px,13vw,66px)", lineHeight: 1, letterSpacing: ".02em" }}>{year}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontWeight: 600, fontSize: "clamp(12px,3.4vw,15px)", letterSpacing: ".34em", marginTop: 5 }}>✓ EXACT</div>
      </div>
    </div>
  );
}

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mirror of api/generate-headlines.js#isValidHeadline. Used to reject
// placeholder / test / corrupt entries that might be in cached state or in
// what the server returns, so a player never sees `placeholder` as a
// question.
function isValidHeadlineClient(h) {
  if (!h || typeof h !== 'object') return false;
  if (typeof h.text !== 'string' || h.text.trim().length < 20) return false;
  // Match the slider range (1900–2026). Out-of-range events can't be guessed.
  if (typeof h.year !== 'number' || h.year < 1900 || h.year > 2026) return false;
  if (typeof h.publication !== 'string' || h.publication.trim().length < 3) return false;
  const bad = /^\s*(placeholder|test|todo|tbd|fixme|sample|example|none|null|undefined|n\/a|xxx)\s*$/i;
  if (bad.test(h.text) || bad.test(h.publication)) return false;
  return true;
}

// Newspaper masthead format: "Saturday · 23rd May 2026". Used under the
// HEADLINES wordmark on intro / play / results so the player always sees
// which edition they're playing. Built manually since Intl doesn't do
// ordinal suffixes.
function getMastheadDate(d = new Date()) {
  const day = d.getDate();
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} · ${day}${suffix} ${month} ${d.getFullYear()}`;
}
const TODAY_MASTHEAD = getMastheadDate();

// "2026-05-28" → "Thu · 28 May 2026" for the Recent editions list. Parsed as
// local (not UTC) to avoid an off-by-one day.
function formatEditionDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short' });
  const month = dt.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} · ${d} ${month} ${y}`;
}

// Permanent, collapsed-by-default explainer for the results page. Quiet by
// design — curious players can tap to learn how points work; everyone else
// scrolls past.
// Verdict tiers shown in the scoring modal AND in the bottom-of-page
// explainer. Single source of truth so the displayed table stays in sync
// with getVerdict / finalRemark thresholds above.
const VERDICT_TIERS = [
  { range: "490+",    label: "Outstanding",     avgOff: "≤ 1" },
  { range: "450–489", label: "Excellent",       avgOff: "≤ 5" },
  { range: "400–449", label: "Very Good",       avgOff: "≤ 10" },
  { range: "320–399", label: "Solid",           avgOff: "≤ 18" },
  { range: "220–319", label: "Reasonable",      avgOff: "≤ 28" },
  { range: "< 220",   label: "Wide of the mark", avgOff: "> 28" },
];

// Full-page modal explaining the scoring + verdict tiers. Triggered from
// near the verdict label at the top of results, and from the existing
// "How is your score worked out?" button at the bottom of results.
function ScoringInfoModal({ open, onClose }) {
  if (!open) return null;
  // Rendered via portal to document.body so `position: fixed` works no matter
  // how deeply nested the trigger is — `.in`'s animation transforms create
  // a containing block that otherwise clips the overlay to its parent.
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        zIndex: 300, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", maxWidth: 480, width: "100%", maxHeight: "85vh",
          overflowY: "auto", borderRadius: 4, padding: "22px 22px 24px",
          boxShadow: "0 10px 40px rgba(0,0,0,.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: "#121212" }}>
            How scoring works
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: 22, color: "#555", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
          >✕</button>
        </div>

        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, lineHeight: 1.55, color: "#444" }}>
          <p style={{ marginBottom: 14 }}>
            Each headline is worth up to <strong>100 points</strong>. You lose <strong>2 points for every year</strong> your guess is off the real date — spot on scores 100, ten years off scores 80, fifty years or more scores 0. Five headlines per day means a possible total of <strong>500</strong>.
          </p>

          <div style={{ marginTop: 18, marginBottom: 8, fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>
            Verdict tiers
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e0e0e0", color: "#666" }}>
                <th style={{ textAlign: "left", padding: "6px 10px 6px 0", fontWeight: 600 }}>Score</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Verdict</th>
                <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>Avg yrs off</th>
              </tr>
            </thead>
            <tbody>
              {VERDICT_TIERS.map((t, i) => (
                <tr key={i} style={{ borderBottom: i < VERDICT_TIERS.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <td style={{ padding: "9px 10px 9px 0", color: "#666", whiteSpace: "nowrap" }}>{t.range}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 600, color: "#121212" }}>{t.label}</td>
                  <td style={{ padding: "9px 0", color: "#666", textAlign: "right", whiteSpace: "nowrap" }}>{t.avgOff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ), document.body);
}

// Feedback modal — opens from the burger menu so a player can leave
// feedback from anywhere (intro, mid-play, results). Reuses /api/feedback
// (same endpoint the results-screen form uses), so admin sees everything in
// one place. Portal-based for the same fixed-positioning reason as
// ScoringInfoModal.
function FeedbackModal({ open, onClose }) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent
  if (!open) return null;

  function send() {
    const trimmed = message.trim();
    if (!trimmed || state !== "idle") return;
    setState("sending");
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed, email: email.trim() || null, score: null, date: getTodayString() }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        setState("sent");
      })
      .catch(() => setState("idle"));
  }

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
        zIndex: 300, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", maxWidth: 480, width: "100%", maxHeight: "85vh",
          overflowY: "auto", borderRadius: 4, padding: "22px 22px 24px",
          boxShadow: "0 10px 40px rgba(0,0,0,.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: "#121212" }}>
            Send feedback
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: 22, color: "#555", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
          >✕</button>
        </div>

        {state === "sent" ? (
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#1a7c3a", fontStyle: "italic", padding: "16px 0", textAlign: "center" }}>
            ✓ Thanks — every bit of feedback helps.
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555", marginBottom: 12, fontStyle: "italic" }}>
              One idea, one bug, one thing you'd love — we read every reply.
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              disabled={state === "sending"}
              placeholder="Type your thought…"
              rows={4}
              style={{
                width: "100%", fontFamily: "'Source Serif 4', serif", fontSize: 14,
                color: "#121212", border: "1px solid #d0d0d0", borderRadius: 2,
                padding: "10px 12px", boxSizing: "border-box", resize: "vertical",
                background: state === "sending" ? "#f7f7f7" : "#fff",
              }}
            />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 254))}
              disabled={state === "sending"}
              placeholder="Email (optional — only if you'd like a reply)"
              style={{
                width: "100%", marginTop: 8, fontFamily: "'Source Serif 4', serif", fontSize: 14,
                color: "#121212", border: "1px solid #d0d0d0", borderRadius: 2,
                padding: "10px 12px", boxSizing: "border-box",
                background: state === "sending" ? "#f7f7f7" : "#fff",
              }}
            />
            <button
              onClick={send}
              disabled={!message.trim() || state === "sending"}
              style={{
                marginTop: 12, width: "100%", padding: "11px",
                background: !message.trim() || state === "sending" ? "#bbb" : "#121212",
                color: "#fff", border: "none", cursor: !message.trim() || state === "sending" ? "default" : "pointer",
                fontFamily: "'Source Serif 4', serif", fontSize: 13, letterSpacing: ".06em",
                textTransform: "uppercase",
              }}
            >
              {state === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  ), document.body);
}

function ScoringExplainer({ onOpenInfo }) {
  return (
    <div style={{ marginTop: 28, textAlign: "center" }}>
      <button
        onClick={onOpenInfo}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'Source Serif 4', serif", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "#666", textDecoration: "underline" }}
      >
        How is your score worked out?
      </button>
    </div>
  );
}

// ── HINT: "the rest of the front page" ───────────────────────────────────────
// Prototype of the in-play hint. Reveals a second, more famous headline from the
// same year as a clue (never states the year). Self-contained state for now;
// the real version wires `hint` from the headline + a half-points penalty.
function HintBlock({ hint, onReveal }) {
  const [stage, setStage] = useState("idle"); // idle | confirm | revealed
  const serif = "'Source Serif 4', serif";
  // Confirm + reveal share a reserved height (content vertically centred) so the
  // Lock-in button below never shifts when you go from confirm → revealed.
  // Sized to fit a 2-line clue; the generator caps hint length so it holds.
  const reserved = { minHeight: 156, display: "flex", flexDirection: "column", justifyContent: "center", margin: "6px 0 20px" };

  if (stage === "revealed") {
    return (
      <div style={reserved}>
        <div style={{ border: "1px solid #121212", background: "#fbfaf5", padding: "15px 16px 16px" }}>
          <div style={{ fontFamily: serif, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "#b91c1c", textAlign: "center", marginBottom: 9, borderBottom: "1px solid #e6e0d2", paddingBottom: 8 }}>Elsewhere that year</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(15px,4.4vw,19px)", fontWeight: 900, fontStyle: "italic", color: "#121212", lineHeight: 1.3, textAlign: "center" }}>“{hint}”</div>
        </div>
        <div style={{ textAlign: "center", marginTop: 9, fontFamily: serif, fontSize: 12, color: "#b8860b", fontStyle: "italic" }}>½ points on this headline · hint used</div>
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <div style={{ ...reserved, border: "1px solid #e3ddcf", background: "#faf7f0", borderRadius: 12, padding: "15px 16px", textAlign: "center" }}>
        <div style={{ fontFamily: serif, fontSize: 14, color: "#444", lineHeight: 1.5, marginBottom: 13 }}>This <strong>halves your points</strong> on this headline. Reveal a clue?</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => setStage("idle")} style={{ padding: "9px 18px", border: "1px solid #d0d0d0", background: "#fff", borderRadius: 8, fontFamily: serif, fontSize: 13.5, cursor: "pointer", color: "#555" }}>Not yet</button>
          <button onClick={() => { setStage("revealed"); onReveal?.(); }} style={{ padding: "9px 18px", border: "none", background: "#121212", color: "#fff", borderRadius: 8, fontFamily: serif, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Reveal clue →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", margin: "2px 0 20px" }}>
      <button onClick={() => setStage("confirm")} style={{ background: "none", border: "none", color: "#777", fontFamily: serif, fontSize: 13.5, cursor: "pointer", padding: 6 }}>
        🔍 <span style={{ textDecoration: "underline" }}>Stuck? See another headline from the same year</span>
      </button>
    </div>
  );
}

// ── TEMPORARY NOTICE ─────────────────────────────────────────────────────────
// A short transparency banner shown on every screen until SCORE_FIX_NOTICE_UNTIL
// (inclusive), then it auto-hides forever — no code change needed to remove it.
// Dismissible per browser. Bump/remove the constant for future one-off notices.
const SCORE_FIX_NOTICE_UNTIL = '2026-07-08';
function NoticeBanner() {
  const [dismissed, setDismissed] = useState(() => !!getStorage('hl_notice_scorefix', false));
  if (dismissed || getTodayString() > SCORE_FIX_NOTICE_UNTIL) return null;
  return (
    <div className="in" style={{ width: '100%', maxWidth: 540, margin: '0 auto 20px', background: '#fdf4e3', border: '1px solid #e3ddcf', borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: "'Source Serif 4', serif" }}>
      <div style={{ fontSize: 13, color: '#5a3a18', lineHeight: 1.5, flex: 1 }}>
        <strong>Quick note:</strong> a brief display glitch recently made a few scorecards show a total that didn't match their colour grid. It's fixed now — your real score is the one that matches your grid. Thanks for bearing with us!
      </div>
      <button
        onClick={() => { setStorage('hl_notice_scorefix', true); setDismissed(true); }}
        aria-label="Dismiss notice"
        style={{ background: 'none', border: 'none', color: '#8a6a3a', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}
      >✕</button>
    </div>
  );
}

// ── HINT HELPFULNESS VOTE ────────────────────────────────────────────────────
// Once-per-day "was the hint helpful?" shown on the results screen ONLY to
// players who used at least one clue. This is the QUALITY signal (are the clues
// any good) — the usage / "do people want hints" signal is already logged from
// every completed game. Records to the existing track-completion endpoint.
function HintVote({ show, date }) {
  const [voted, setVoted] = useState(() => !!getStorage(`hl_hint_vote_${date}`, false));
  const [justVoted, setJustVoted] = useState(false);
  if (!show || (voted && !justVoted)) return null;

  const card = (children) => (
    <div className="in" style={{ border: "1px solid #e3ddcf", background: "#faf7f0", borderRadius: 12, padding: "14px 16px", marginBottom: 28, textAlign: "center", fontFamily: "'Source Serif 4', serif" }}>{children}</div>
  );
  if (justVoted) return card(<div style={{ fontSize: 13.5, color: "#1a7c3a", fontStyle: "italic" }}>✓ Thanks — that helps us tune the clues.</div>);

  const vote = (v) => {
    setStorage(`hl_hint_vote_${date}`, v);
    setVoted(true); setJustVoted(true);
    fetch('/api/track-completion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, hintVote: v }),
    }).catch(() => {});
  };
  const btn = (label, v) => (
    <button onClick={() => vote(v)} style={{ padding: "8px 24px", border: "1px solid #d8cfb8", background: "#fff", borderRadius: 10, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>{label}</button>
  );
  return card(
    <>
      <div style={{ fontSize: 14, color: "#444", marginBottom: 12 }}>You used a clue this round — was it helpful?</div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>{btn("👍", "up")}{btn("👎", "down")}</div>
    </>
  );
}

// ── AI HEADLINE GENERATOR ────────────────────────────────────────────────────
async function generateNewHeadlines(usedIds, existingPool) {
  const usedTexts = existingPool
    .filter(h => usedIds.includes(h.id))
    .map(h => h.text)
    .slice(-50); // send last 50 used so AI avoids repeats

  const prompt = `You are a historian creating a daily newspaper history quiz game called HEADLINES.

Generate exactly 15 new historically significant headlines from real events across world history (1900–2025).

RULES:
- Cover diverse eras: pre-war, WW2, Cold War, modern era, recent decades
- Cover diverse regions: Americas, Europe, Asia, Africa, Middle East, Oceania
- NO political bias — focus on: science, disasters, sport, exploration, medicine, technology, economics, culture, wars beginning/ending
- Headlines must be factually accurate real events
- Write in the style of newspaper front pages — ALL CAPS, dramatic, concise
- Each must be genuinely surprising/interesting to guess the year of
- DO NOT repeat any of these already used headlines: ${usedTexts.slice(0,20).join(" | ")}

For each headline return EXACTLY this JSON structure (no markdown, no extra text, just raw JSON array):
[
  {
    "id": "ai_[unique_8_char_hash]",
    "text": "HEADLINE TEXT HERE IN ALL CAPS",
    "year": 1965,
    "publication": "Publication Name",
    "pubColor": "#1a1a1a",
    "context": "2-3 sentence factual context shown after the player guesses."
  }
]

Publication options and their colors:
- "The New York Times" → "#1a1a1a"
- "The Guardian" → "#0a4a7c"  
- "Financial Times" → "#c8500a"
- "The Times" → "#8b1a1a"
- "The Daily Telegraph" → "#1a1a1a"
- "Washington Post" → "#1a1a1a"
- "Daily Mirror" → "#1a1a1a"
- "Chicago Tribune" → "#1a1a1a"
- "Der Spiegel" → "#1a1a1a"
- "Le Monde" → "#1a1a1a"
- "The Hindu" → "#1a1a1a"
- "South China Morning Post" → "#1a1a1a"
- "Sydney Morning Herald" → "#1a1a1a"
- "Folha de S.Paulo" → "#1a1a1a"
- "Al-Jazeera" → "#1a1a1a"
- "Asahi Shimbun" → "#1a1a1a"

Return ONLY the JSON array. No preamble, no markdown fences.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    const headlines = JSON.parse(clean);

    // Validate structure
    return headlines.filter(h =>
      h.id && h.text && h.year && h.publication && h.context &&
      typeof h.year === "number" && h.year >= 1900 && h.year <= 2025
    );
  } catch (err) {
    console.error("AI generation failed:", err);
    return [];
  }
}

// ── DAILY HEADLINE MANAGER ───────────────────────────────────────────────────
async function getDailyHeadlines() {
  const today = getTodayString();

  // Already have today's headlines cached?
  const cachedDate = getStorage(STORAGE_KEYS.TODAY_DATE);
  const cachedHL   = getStorage(STORAGE_KEYS.TODAY_HEADLINES);
  // Invalidate any cached seed-fallback headlines (IDs start with "s") so
  // players who got seeds during the outage refetch real AI headlines.
  const cachedIsSeed = Array.isArray(cachedHL) &&
    cachedHL.some(h => typeof h?.id === "string" && /^s\d+$/.test(h.id));
  // Reject cached batches with any invalid item (e.g. a `placeholder` that
  // slipped through pre-validation server-side) — force a refetch.
  const cachedHasInvalid = Array.isArray(cachedHL) && cachedHL.some(h => !isValidHeadlineClient(h));
  if (cachedDate === today && cachedHL?.length === 5 && !cachedIsSeed && !cachedHasInvalid) {
    return { headlines: cachedHL, fromCache: true };
  }

  // Always fetch fresh AI headlines for today
  const usedIds = getStorage(STORAGE_KEYS.USED_IDS, []);
  const usedTexts = usedIds.slice(-50);

  try {
    const response = await fetch('/api/generate-headlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usedTexts, date: today }),
    });
    const data = await response.json();
    const todaysHeadlines = (data.headlines || []).slice(0, 5).map(h => ({...h, context: h.context || h.explanation || ""}));

    if (todaysHeadlines.length === 5) {
      const newUsedIds = [...usedIds, ...todaysHeadlines.map(h => h.text)];
      setStorage(STORAGE_KEYS.USED_IDS, newUsedIds);
      setStorage(STORAGE_KEYS.TODAY_DATE, today);
      setStorage(STORAGE_KEYS.TODAY_HEADLINES, todaysHeadlines);
      return { headlines: todaysHeadlines, fromCache: false };
    }
  } catch(e) {
    console.error('API failed, using seed headlines', e);
  }

  // Fallback to seed headlines only if API fails.
  // IMPORTANT: do NOT persist these to localStorage, so the next page load
  // retries the API. Otherwise a single transient 500 locks a player into
  // stale seed headlines for the whole day.
  const todaysHeadlines = SEED_HEADLINES.slice(0, 5);
  return { headlines: todaysHeadlines, fromCache: false, fromFallback: true };
}

// ── GAME CONSTANTS ───────────────────────────────────────────────────────────
const MIN = 1900, MAX = 2026;
const TODAY_LONG  = new Date().toLocaleDateString("en-US", { month: "long",  day: "numeric", year: "numeric" });
const TODAY_SHORT = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

function calcScore(guess, actual, hintUsed = false) {
  // Linear scoring: you lose 2 displayed points for every year you're off
  // (exact = 100, 10 yrs off = 80, 50+ yrs off = 0). Kept on the internal
  // 0–1000 per-question scale (so 20 raw points per year) to preserve the
  // 0–5000 leaderboard validation and all existing saved scores.
  // A revealed hint halves that question's score (rounded).
  if (!Number.isFinite(guess) || !Number.isFinite(actual)) return 0;
  const d = Math.abs(guess - actual);
  const base = Math.max(0, 1000 - 20 * d);
  return hintUsed ? Math.round(base / 2) : base;
}

// Verdict tiers. `avg` is the mean raw score per headline (0–1000); display
// score is avg/10 (so 980 raw = 98 displayed = 1 yr off avg). Six tiers so
// the top end has hierarchy instead of two synonyms — "Outstanding" sits
// genuinely above "Excellent", which sits above "Very Good".
//   Outstanding ≥980 (~1 yr off)   Excellent ≥900 (≤5)   Very Good ≥800 (≤10)
//   Solid ≥640 (≤18)               Reasonable ≥440 (≤28) Wide <440 (>28)
// NOTE: keep these thresholds in sync with finalRemark() below.
function getVerdict(avg) {
  if (avg >= 980) return "Outstanding";
  if (avg >= 900) return "Excellent";
  if (avg >= 800) return "Very Good";
  if (avg >= 640) return "Solid";
  if (avg >= 440) return "Reasonable";
  return "Wide of the mark";
}

// ── EDITOR'S DESK ────────────────────────────────────────────────────────────
// Dry newspaper-editor commentary, picked deterministically from the player's
// year-off so it doesn't flicker on re-render. Keep them brand-true: Playfair
// italic, no emoji, slight wink. If you want to swap any out, edit the arrays.
const EDITOR_REMARKS_PER_QUESTION = {
  exact: [
    "The editors tip their hat.",
    "Pin-point. Front page.",
    "An impressive byline.",
    "Spot on. File it under 'showing off'.",
  ],
  one: [
    "Sub-editor would forgive that.",
    "Close enough for the late edition.",
    "Almost made the headline.",
    "A year out — well within style.",
  ],
  close: [ // 2–5 yrs
    "A respectable miss.",
    "Within shouting distance.",
    "Close enough to gossip about.",
    "In the right edition, at least.",
  ],
  mid: [ // 6–15 yrs
    "The right era. Not the right year.",
    "A decade or so adrift.",
    "Not quite vintage.",
    "Drifting from the front page.",
  ],
  far: [ // 16–30 yrs
    "Wider than the editor would like.",
    "Were you skimming?",
    "Different era altogether.",
    "Worth a re-read.",
  ],
  wild: [ // 30+ yrs
    "Off the print run entirely.",
    "Recycle bin material.",
    "Different century, different newsroom.",
    "An archive-defying guess.",
  ],
};

function editorRemark(diff) {
  const d = Math.abs(diff);
  let band;
  if (d === 0)      band = EDITOR_REMARKS_PER_QUESTION.exact;
  else if (d === 1) band = EDITOR_REMARKS_PER_QUESTION.one;
  else if (d <= 5)  band = EDITOR_REMARKS_PER_QUESTION.close;
  else if (d <= 15) band = EDITOR_REMARKS_PER_QUESTION.mid;
  else if (d <= 30) band = EDITOR_REMARKS_PER_QUESTION.far;
  else              band = EDITOR_REMARKS_PER_QUESTION.wild;
  // Deterministic — same diff always gives the same line, so re-renders are stable.
  return band[Math.abs(d * 13 + 7) % band.length];
}

const FINAL_REMARKS = {
  outstanding: ["The editor steps aside — you have the desk.", "Front-page material. Print it."],
  excellent:   ["The newsroom takes note. Bylines incoming.", "A senior correspondent in the making."],
  veryGood:    ["Strong copy. The sub-editors approve.", "A respectable byline."],
  solid:       ["Steady hand on the news desk.", "A reliable cub reporter."],
  reasonable:  ["Promising — keep reading the front page.", "More archive time, perhaps."],
  wide:        ["A stack of back-issues has your name on it.", "Try the morning papers tomorrow."],
};

function finalRemark(avg) {
  // Thresholds must match getVerdict() above.
  let band;
  if (avg >= 980)      band = FINAL_REMARKS.outstanding;
  else if (avg >= 900) band = FINAL_REMARKS.excellent;
  else if (avg >= 800) band = FINAL_REMARKS.veryGood;
  else if (avg >= 640) band = FINAL_REMARKS.solid;
  else if (avg >= 440) band = FINAL_REMARKS.reasonable;
  else                 band = FINAL_REMARKS.wide;
  return band[avg % band.length];
}

function dotColor(d) {
  if (d <= 3)  return "#1a7c3a";
  if (d <= 10) return "#b8860b";
  return "#b91c1c";
}

// ── SHARE CARD ───────────────────────────────────────────────────────────────
function ShareCard({ headlines, guesses, scores, hints }) {
  const total  = scores.reduce((a, b) => a + b, 0);
  const max    = headlines.length * 1000;
  const avg    = Math.round(total / headlines.length);
  const toPos  = y => ((y - MIN) / (MAX - MIN)) * 100;

  return (
    <div style={{ background: "#fff", border: "2px solid #121212", maxWidth: 360, margin: "0 auto", fontFamily: "'Georgia', serif" }}>
      <div style={{ background: "#121212", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}>HEADLINES</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#555", fontStyle: "italic" }}>{TODAY_SHORT}</div>
      </div>

      <div style={{ padding: "16px 20px 12px" }}>
        {headlines.map((h, i) => {
          const d    = Math.abs(guesses[i] - h.year);
          const exact = d === 0;
          const col  = dotColor(d);
          const gPos = toPos(guesses[i]);
          const aPos = toPos(h.year);
          return (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 900, color: "#121212" }}>{h.year}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {hints?.[i] && <span title="hint used" style={{ fontSize: 12 }}>💡</span>}
                  {!exact && <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555", fontStyle: "italic" }}>guessed {guesses[i]}</div>}
                  <div style={{ padding: "2px 8px", background: col, color: "#fff", fontFamily: "'Source Serif 4', serif", fontSize: 11, fontWeight: 600, borderRadius: 2 }}>
                    {exact ? "✓ Exact" : `${guesses[i] > h.year ? "+" : ""}${guesses[i] - h.year}yr${d !== 1 ? "s" : ""}`}
                  </div>
                </div>
              </div>
              <div style={{ position: "relative", height: 12 }}>
                <div style={{ position: "absolute", top: 5, left: 0, right: 0, height: 2, background: "#e8e8e8" }} />
                {!exact && <div style={{ position: "absolute", top: 5, left: `${Math.min(gPos, aPos)}%`, width: `${Math.abs(gPos - aPos)}%`, height: 2, background: col, opacity: 0.35 }} />}
                <div style={{ position: "absolute", left: `${aPos}%`, top: 2, transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: col, zIndex: 2 }} />
                {!exact && <div style={{ position: "absolute", left: `${gPos}%`, top: 2, transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: "#fff", border: `2px solid ${col}`, zIndex: 2 }} />}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                {[1920, 1960, 2000].map(y => <div key={y} style={{ fontFamily: "'Source Serif 4', serif", fontSize: 8, color: "#d0d0d0" }}>{y}</div>)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: "#e0e0e0", margin: "0 20px" }} />

      <div style={{ padding: "12px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 15, color: "#121212" }}>"{getVerdict(avg)}"</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#666", marginTop: 2 }}>headlines.games</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, color: "#121212", lineHeight: 1 }}>{displayScore(total)}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#666" }}>/ {displayScore(max)}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #e0e0e0", padding: "8px 20px", display: "flex", gap: 16 }}>
        {[{ c: "#1a7c3a", l: "≤ 3 yrs" }, { c: "#b8860b", l: "≤ 10 yrs" }, { c: "#b91c1c", l: "> 10 yrs" }].map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: x.c }} />
            <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 9, color: "#666" }}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────

// ── REVIEW SCREEN ─────────────────────────────────────────────────────────────
// Minimum recorded guesses on a headline before we show the "how others did"
// comparison. Below this the percentages are too noisy to mean anything — and
// we'd rather show nothing than a misleading number. (Real data now — the old
// getSimulatedStats fabricated these; removed.)
const MIN_COMPARE_SAMPLE = 20;

// % of recorded guesses within `band` years of the true year. null if no data.
function pctWithinBand(dist, total, trueYear, band) {
  if (!dist || !total) return null;
  let c = 0;
  for (const yr in dist) {
    if (Math.abs(Number(yr) - trueYear) <= band) c += dist[yr];
  }
  return Math.round((c / total) * 100);
}

// Mean absolute year-error of the crowd on a headline (how hard it played).
function crowdMeanError(dist, total, trueYear) {
  if (!dist || !total || trueYear == null) return null;
  let s = 0;
  for (const yr in dist) s += Math.abs(Number(yr) - trueYear) * dist[yr];
  return s / total;
}

// % of the crowd you beat on a headline (strictly closer; ties count half).
// This is the per-item "Skill" — beating the field on a high-scatter headline
// naturally scores higher, so difficulty-weighting comes for free.
function pctCrowdBeaten(dist, total, trueYear, yourErr) {
  if (!dist || !total || trueYear == null) return null;
  let beat = 0, tie = 0;
  for (const yr in dist) {
    const e = Math.abs(Number(yr) - trueYear);
    if (e > yourErr) beat += dist[yr];
    else if (e === yourErr) tie += dist[yr];
  }
  return Math.round(((beat + tie * 0.5) / total) * 100);
}

function Timeline({ guessYear, actualYear }) {
  const MIN = 1900, MAX = 2026;
  const aPos = ((actualYear - MIN) / (MAX - MIN)) * 100;
  const gPos = ((guessYear  - MIN) / (MAX - MIN)) * 100;
  const exact = guessYear === actualYear;
  const col = exact ? "#1a7c3a" : Math.abs(guessYear - actualYear) <= 5 ? "#2563a8" : "#b91c1c";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ position: "relative", height: 20, marginBottom: 4 }}>
        <div style={{ position: "absolute", top: 9, left: 0, right: 0, height: 2, background: "#e8e8e8", borderRadius: 1 }} />
        <div style={{ position: "absolute", left: `${aPos}%`, top: 4, transform: "translateX(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#121212", zIndex: 2 }} />
        {!exact && <div style={{ position: "absolute", left: `${gPos}%`, top: 4, transform: "translateX(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#fff", border: `2px solid ${col}`, zIndex: 2 }} />}
        {!exact && <div style={{ position: "absolute", top: 8, left: `${Math.min(gPos, aPos)}%`, width: `${Math.abs(gPos - aPos)}%`, height: 4, background: col, opacity: 0.2 }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {[1920,1960,2000].map(y => <div key={y} style={{ fontFamily: "'Source Serif 4', serif", fontSize: 9, color: "#777" }}>{y}</div>)}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#121212" }} />
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555" }}>Actual: <strong>{actualYear}</strong></span>
        </div>
        {!exact && <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", border: `2px solid ${col}` }} />
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555" }}>Your guess: <strong>{guessYear}</strong></span>
        </div>}
        {exact && <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#1a7c3a", fontStyle: "italic" }}>✓ Exact year</span>}
      </div>
    </div>
  );
}

function ReviewScreen({ headlines, guesses, scores, onClose, countdown, onPlayMore }) {
  const N = headlines.length;
  // Linear "click-through" journey (Wordle-Bot style): step 0 = intro,
  // steps 1..N = one headline each, step N+1 = outro (recap + play-next +
  // countdown). A progress bar tracks position; Back/Next move through it.
  const [step, setStep] = useState(0);
  const [flagged, setFlagged] = useState(() => getStorage(STORAGE_KEYS.OBSCURE_FLAGS, {}));
  // Real per-headline guess distribution. null = not loaded.
  const [realStats, setRealStats] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/track-completion?date=${getTodayString()}`)
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d?.headlines)) setRealStats(d.headlines); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const realFor = (i) => (Array.isArray(realStats) ? realStats[i] : null);

  function flagObscure(hh) {
    const flagKey = `${getTodayString()}__${hh.text}`;
    if (flagged[flagKey]) return;
    const next = { ...flagged, [flagKey]: true };
    setFlagged(next);
    setStorage(STORAGE_KEYS.OBSCURE_FLAGS, next);
    fetch('/api/feedback-obscure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: getPlayerUUID(), date: getTodayString(), text: hh.text, year: hh.year, category: hh.category || null, publication: hh.publication }),
    }).catch(() => {});
  }

  const totalScore = scores.reduce((a, b) => a + b, 0);
  const maxScore = headlines.length * 1000;
  const avgScore = N ? Math.round(totalScore / N) : 0;
  // Directional bias — your own data, always available. Positive = too recent.
  const meanSigned = Math.round(headlines.reduce((a, hh, i) => a + (guesses[i] - hh.year), 0) / headlines.length);
  const biasLine = Math.abs(meanSigned) <= 1 ? "Spot on — no consistent lean either way"
    : `On average you guessed ~${Math.abs(meanSigned)} years too ${meanSigned > 0 ? "recent" : "early"}`;

  const shell = (children) => (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 100, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px 40px" }}>{children}</div>
    </div>
  );

  const lblStyle = { fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" };

  const go = (s) => { setStep(Math.max(0, Math.min(N + 1, s))); window.scrollTo({ top: 0 }); };

  // Segmented progress bar (one dash per step) + a close affordance, mirroring
  // the Wordle-Bot slide chrome. Rendered at the top of every step.
  const topBar = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0 20px" }}>
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {Array.from({ length: N + 2 }).map((_, k) => (
          <div key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k <= step ? "#1a7c3a" : "#e2e0d9", transition: "background .2s" }} />
        ))}
      </div>
      <button onClick={onClose} aria-label="Close analysis" style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
    </div>
  );

  // Bottom Back / primary-action bar shared by the intro + headline steps.
  const navBar = (nextLabel, onNext) => (
    <div style={{ display: "flex", gap: 10, borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 24 }}>
      <button onClick={() => go(step - 1)} disabled={step === 0} style={{ flex: 1, padding: "13px", border: "1px solid #e0e0e0", background: "#fff", fontFamily: "'Source Serif 4', serif", fontSize: 14, color: step === 0 ? "#ccc" : "#121212", cursor: step === 0 ? "default" : "pointer", borderRadius: 8 }}>Back</button>
      <button onClick={onNext} style={{ flex: 2, padding: "13px", background: "#121212", color: "#fff", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 8 }}>{nextLabel}</button>
    </div>
  );

  // ── STEP 0: intro — "get ready for your analysis" ──
  if (step === 0) {
    return shell(
      <>
        {topBar}
        <div style={{ paddingTop: 4 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,7.5vw,34px)", fontWeight: 900, color: "#121212", lineHeight: 1.12, letterSpacing: "-.02em", marginBottom: 20 }}>
            Let's break down<br />today's edition.
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, lineHeight: 1.75, color: "#444", marginBottom: 16 }}>
            We'll go through all {N} headlines one at a time — how close your guess was, how you stacked up against everyone else who played, and the story behind each one.
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, lineHeight: 1.75, color: "#444" }}>
            At the end: your overall read on the year — and where to play next.
          </div>
        </div>
        {navBar("Begin →", () => go(1))}
      </>
    );
  }

  // ── STEPS 1..N: one headline per step, clicked through in order ──
  if (step >= 1 && step <= N && headlines[step - 1]) {
    const i = step - 1, h = headlines[i], g = guesses[i], s = scores[i];
    const diff = Math.abs(g - h.year);
    const rs = realFor(i);
    const enough = rs && rs.total >= MIN_COMPARE_SAMPLE;
    const closer = enough ? pctCrowdBeaten(rs.dist, rs.total, h.year, diff) : null;
    const isFlagged = flagged[`${getTodayString()}__${h.text}`];
    let decades = [], buckets = [], trueBi = -1, guessBi = -1, bMax = 1;
    if (enough) {
      for (let d = 1900; d <= 2020; d += 10) decades.push(d);
      buckets = decades.map(() => 0);
      for (const yr in rs.dist) buckets[Math.min(decades.length - 1, Math.max(0, Math.floor((Number(yr) - 1900) / 10)))] += rs.dist[yr];
      trueBi = Math.min(decades.length - 1, Math.max(0, Math.floor((h.year - 1900) / 10)));
      guessBi = Math.min(decades.length - 1, Math.max(0, Math.floor((g - 1900) / 10)));
      bMax = Math.max(1, ...buckets);
    }
    return shell(
      <>
        {topBar}
        <div style={{ ...lblStyle, marginBottom: 6 }}>Headline {i + 1} of {N} · {h.publication} · {h.year}</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(18px,5vw,22px)", fontWeight: 900, color: "#121212", lineHeight: 1.3, marginBottom: 16 }}>{h.text}</div>

        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: "#444", lineHeight: 1.6, paddingBottom: 18, borderBottom: "1px solid #f0f0f0", marginBottom: 18 }}>
          You guessed <b style={{ color: diff === 0 ? "#1a7c3a" : diff <= 5 ? "#2563a8" : "#b91c1c" }}>{g}</b> · the answer was <b>{h.year}</b>{diff === 0 ? " — spot on!" : ` — ${diff} year${diff > 1 ? "s" : ""} off`}
        </div>

        {/* Deliberately NO player count here — the absolute number would leak
            daily active users. The crowd distribution + relative percentiles
            stay; raw totals are admin-only (see the admin dashboard). */}
        <div style={{ ...lblStyle, marginBottom: 14 }}>How everyone guessed</div>
        {enough ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64, marginBottom: 4 }}>
              {buckets.map((n, k) => (<div key={k} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div style={{ width: "100%", height: `${(n / bMax) * 100}%`, background: k === trueBi ? "#1a7c3a" : "#cfcabb", borderRadius: "2px 2px 0 0", minHeight: n ? 2 : 0 }} /></div>))}
            </div>
            <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
              {decades.map((d, k) => (<div key={k} style={{ flex: 1, textAlign: "center", fontSize: 8.5, color: k === trueBi ? "#1a7c3a" : (k === guessBi ? "#b91c1c" : "#bbb"), fontWeight: (k === trueBi || k === guessBi) ? 700 : 400 }}>{k === trueBi ? `${h.year}✓` : (k === guessBi ? "you" : `'${String(d).slice(2)}`)}</div>))}
            </div>
            {closer != null && (
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600, color: closer >= 50 ? "#1a7c3a" : "#b91c1c" }}>
                {closer >= 50 ? "✓ " : ""}You were closer than {closer}% of players
              </div>
            )}
          </>
        ) : (
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#999", fontStyle: "italic", lineHeight: 1.5 }}>Not enough players have finished today's edition yet — check back later.</div>
        )}

        <div style={{ ...lblStyle, marginTop: 24, marginBottom: 10, borderTop: "1px solid #f0f0f0", paddingTop: 18 }}>The story</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, lineHeight: 1.8, color: "#444" }}>{h.context}</div>

        <div style={{ textAlign: "center", margin: "18px 0" }}>
          <button onClick={() => flagObscure(h)} disabled={!!isFlagged} style={{ background: "none", border: "1px solid #e0e0e0", padding: "8px 14px", fontFamily: "'Source Serif 4', serif", fontSize: 12, color: isFlagged ? "#1a7c3a" : "#888", cursor: isFlagged ? "default" : "pointer", borderRadius: 16, fontStyle: "italic" }}>{isFlagged ? "✓ Thanks — we'll make these easier" : "👎 Too obscure?"}</button>
        </div>

        {navBar(step === N ? "See your summary →" : "Next headline →", () => go(step + 1))}
      </>
    );
  }

  // ── STEP N+1: outro — score recap, where to play next, countdown ──
  return shell(
    <>
      {topBar}
      <div style={{ textAlign: "center", paddingTop: 4 }}>
        <div style={{ ...lblStyle, marginBottom: 8 }}>Your analysis</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 60, fontWeight: 900, color: "#121212", lineHeight: 1 }}>{displayScore(totalScore)}<span style={{ fontSize: 22, color: "#bbb" }}>/{displayScore(maxScore)}</span></div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontStyle: "italic", color: "#b91c1c", marginTop: 10 }}>"{getVerdict(avgScore)}"</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13.5, color: "#666", fontStyle: "italic", marginTop: 8 }}>{biasLine}</div>
      </div>

      <div style={{ ...lblStyle, borderTop: "1px solid #e0e0e0", paddingTop: 18, marginTop: 24, marginBottom: 12 }}>Recap · tap to revisit</div>
      {headlines.map((hh, i) => {
        const diff = Math.abs(guesses[i] - hh.year);
        const dcol = diff === 0 ? "#1a7c3a" : diff <= 5 ? "#2563a8" : "#b91c1c";
        const rs = realFor(i);
        const enough = rs && rs.total >= MIN_COMPARE_SAMPLE;
        const closer = enough ? pctCrowdBeaten(rs.dist, rs.total, hh.year, diff) : null;
        return (
          <button key={i} onClick={() => go(i + 1)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#888" }}>{hh.publication} · <b style={{ color: "#121212" }}>{hh.year}</b></div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontStyle: "italic", fontSize: 14, color: "#121212", lineHeight: 1.25, margin: "3px 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{hh.text}</div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#666" }}>You: <b style={{ color: dcol }}>{guesses[i]}</b> · {diff === 0 ? "spot on" : `${diff} yr${diff > 1 ? "s" : ""} off`}{closer != null && ` · closer than ${closer}%`}</div>
            </div>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 20, color: "#121212" }}>{displayScore(scores[i])}</div>
              <div style={{ fontSize: 20, color: "#ccc" }}>›</div>
            </div>
          </button>
        );
      })}

      {/* Where to play next — mirrors Wordle-Bot's "play other editions" close.
          onPlayMore opens the burger menu (practice rounds + past editions). */}
      {onPlayMore && (
        <div style={{ borderTop: "1px solid #e0e0e0", marginTop: 20, paddingTop: 18 }}>
          <div style={{ ...lblStyle, marginBottom: 12 }}>Until tomorrow…</div>
          <button onClick={() => { onClose?.(); onPlayMore?.(); }} style={{ width: "100%", padding: "14px", background: "#1a7c3a", color: "#fff", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 8 }}>
            Play another edition →
          </button>
        </div>
      )}

      {countdown && (
        <div style={{ textAlign: "center", marginTop: 18, fontFamily: "'Source Serif 4', serif", fontSize: 12.5, color: "#777", fontStyle: "italic" }}>New headlines in {countdown}</div>
      )}

      <div style={{ display: "flex", gap: 10, borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 20 }}>
        <button onClick={() => go(step - 1)} style={{ flex: 1, padding: "13px", border: "1px solid #e0e0e0", background: "#fff", fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#121212", cursor: "pointer", borderRadius: 8 }}>Back</button>
        <button onClick={onClose} style={{ flex: 2, padding: "13px", background: "#121212", color: "#fff", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 14, fontWeight: 600, cursor: "pointer", borderRadius: 8 }}>Done</button>
      </div>
    </>
  );
}

// Email sign-in: two tiny steps (email → 6-digit code). No password. On success
// calls onSignedIn({ user, weekly, streak }). getMigrate() returns the local
// play history so a returning player's streak carries onto their account.
function SignInModal({ open, onClose, onSignedIn, getMigrate, reason }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [remind, setRemind] = useState(true);

  useEffect(() => {
    if (open) { setStep("email"); setCode(""); setBusy(false); setError(""); setInfo(""); setRemind(true); }
  }, [open]);

  if (!open) return null;

  async function sendCode() {
    setError(""); setBusy(true);
    try {
      await auth.request(email.trim());
      setStep("code"); setInfo("We emailed a 6-digit code to " + email.trim());
    } catch (e) { setError(e.message); }
    setBusy(false);
  }
  async function signIn() {
    setError(""); setBusy(true);
    try {
      const d = await auth.verify(email.trim(), code.trim(), getMigrate?.(), remind, name.trim());
      onSignedIn?.(d);
      onClose?.();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const serif = "'Source Serif 4', serif";
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 14px", fontSize: 16, fontFamily: serif, border: "1.5px solid #ccc", borderRadius: 10, marginBottom: 12, textAlign: "center" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "26px 22px", width: "100%", maxWidth: 380, fontFamily: serif, boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
        {step === "email" ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>
              Create a free account {reason === "archive" ? "📚" : "🔥"}
            </div>
            <div style={{ fontSize: 14.5, color: "#444", lineHeight: 2, marginBottom: 18, textAlign: "left" }}>
              ✓ Save your streak across devices<br />✓ Unlock every past edition<br />✓ Free · no password · unsubscribe anytime
            </div>
            <input style={inputStyle} type="email" inputMode="email" autoComplete="email" placeholder="your@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && sendCode()} autoFocus />
            <input style={{ ...inputStyle, marginBottom: 4 }} type="text" autoComplete="given-name" maxLength={20} placeholder="First name (optional)"
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && sendCode()} />
            <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 14, fontStyle: "italic" }}>Shown on the daily leaderboard</div>
            <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#444", textAlign: "left", margin: "2px 2px 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} style={{ width: 17, height: 17, accentColor: "#1a7c3a", flexShrink: 0 }} />
              <span>📬 Email me each morning</span>
            </label>
            <button className="btn-green" disabled={busy || !email.includes("@")} onClick={sendCode} style={{ width: "100%", opacity: busy || !email.includes("@") ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Email me a code →"}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 14, color: "#555", marginBottom: 18, lineHeight: 1.45 }}>{info}</div>
            <input style={{ ...inputStyle, letterSpacing: 6, fontSize: 22 }} type="text" inputMode="numeric" maxLength={6} placeholder="······"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && signIn()} autoFocus />
            <button className="btn-green" disabled={busy || code.length !== 6} onClick={signIn} style={{ width: "100%", opacity: busy || code.length !== 6 ? 0.6 : 1 }}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
            <div style={{ fontSize: 12.5, color: "#888", marginTop: 14, textAlign: "center" }}>
              Didn't get it? <span onClick={() => !busy && sendCode()} style={{ color: "#1a7c3a", textDecoration: "underline", cursor: "pointer" }}>Resend</span>
              {"  ·  "}
              <span onClick={() => setStep("email")} style={{ color: "#1a7c3a", textDecoration: "underline", cursor: "pointer" }}>Change email</span>
            </div>
          </>
        )}
        {error && <div style={{ fontSize: 13, color: "#c0392b", marginTop: 12, textAlign: "center" }}>{error}</div>}
        <div onClick={onClose} style={{ fontSize: 12.5, color: "#999", marginTop: 18, textAlign: "center", cursor: "pointer" }}>Maybe later</div>
      </div>
    </div>
  );
}

export default function App() {
  const [loading,  setLoading]  = useState(true);
  const [daily,    setDaily]    = useState([]);
  const today0 = getTodayString();
  // validSave = "the player has saved guesses for today". Reads PLAY_DATE,
  // not TODAY_DATE — TODAY_DATE gets rewritten just by loading the app on a
  // new day (the headline-cache refresh), which would falsely promote
  // yesterday's hl_phase="done" into today and show "already played" to
  // users who haven't actually played yet.
  const savedPlayDate = getStorage(STORAGE_KEYS.PLAY_DATE);
  const validSave = savedPlayDate === today0;
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    function calc() {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return h + 'h ' + String(m).padStart(2,'0') + 'm ' + String(s).padStart(2,'0') + 's';
    }
    setCountdown(calc());
    const t = setInterval(() => setCountdown(calc()), 1000);
    return () => clearInterval(t);
  }, []);
  const [phase,    setPhase]    = useState(validSave ? (getStorage("hl_phase") || "intro") : "intro");

  // ── Auto-update: reload stale tabs when a new build is deployed ───────────
  // A long-open tab keeps running the build it first loaded — which is how an
  // old client can show outdated scoring (the "576/5000" confusion). When the
  // tab regains focus AND the player is on the intro screen (so we never
  // interrupt active play), we check whether the deployed JS bundle hash has
  // changed; if so, reload once (sessionStorage guard prevents any reload loop).
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    let known = null;
    try { known = ([...document.scripts].map(s => s.src).find(u => /\/assets\/index-[\w-]+\.js/.test(u)) || '').split('/').pop() || null; } catch {}
    async function checkForUpdate() {
      if (document.hidden || phaseRef.current !== 'intro' || !known) return;
      if (sessionStorage.getItem('hl_updated')) return;
      try {
        const html = await fetch('/?_v=' + Date.now(), { cache: 'no-store' }).then(r => r.text());
        const m = html.match(/assets\/index-[\w-]+\.js/);
        const latest = m ? m[0].split('/').pop() : null;
        if (latest && latest !== known) {
          sessionStorage.setItem('hl_updated', '1');
          window.location.reload();
        }
      } catch {}
    }
    document.addEventListener('visibilitychange', checkForUpdate);
    return () => document.removeEventListener('visibilitychange', checkForUpdate);
  }, []);
  const [scores,   setScores]   = useState(validSave ? (getStorage("hl_scores") || []) : []);
  const [guesses,  setGuesses]  = useState(validSave ? (getStorage("hl_guesses") || []) : []);
  // Per-question hint usage, parallel to guesses/scores. `hintRevealed` tracks
  // the CURRENT question only; it's pushed into `hints` on lock and reset on
  // advance. Not persisted per-question (a mid-question reload just re-arms it).
  const [hints,    setHints]    = useState(validSave ? (getStorage("hl_hints") || []) : []);
  const [hintRevealed, setHintRevealed] = useState(false);
  // idx is "index of next question to play". `locked` isn't persisted, so a
  // remount after Lock-without-Next would otherwise land the player back on
  // the just-answered question — and a re-lock would double-count their
  // score for that question. Snap idx forward to scores.length so we always
  // resume on the first unanswered question.
  const [idx,      setIdx]      = useState(() => {
    if (!validSave) return 0;
    const savedIdx = getStorage("hl_idx") || 0;
    const savedScores = getStorage("hl_scores") || [];
    return Math.max(savedIdx, Array.isArray(savedScores) ? savedScores.length : 0);
  });
  const [year,     setYear]     = useState(1970);
  // Tappable text input for the year — keeps a string so partial typing
  // ("19" on the way to "1989") doesn't clamp prematurely. Kept in sync
  // with `year` whenever year changes from the slider, ± buttons, or
  // advancing to the next question.
  const [yearInput, setYearInput] = useState("1970");
  useEffect(() => { setYearInput(String(year)); }, [year]);
  const [locked,   setLocked]   = useState(false);
  const [visible,  setVisible]  = useState(false);
  // Exact-year date-stamp overlay: holds the year to stamp (null = hidden).
  // hitKey restarts the animation if two exact guesses happen back-to-back.
  const [stamp,    setStamp]    = useState(null);
  const [stampKey, setStampKey] = useState(0);
  const [copied,   setCopied]   = useState(false);
  // Restore activeSession from a recent heartbeat (within ACTIVE_WINDOW_MS).
  // Defends against an iOS Safari tab teardown / silent remount mid-game,
  // which would otherwise reset this in-memory flag to false and bounce the
  // player to the resume screen between questions.
  const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
  const [activeSession, setActiveSession] = useState(() => {
    const ts = getStorage(STORAGE_KEYS.ACTIVE_PLAY_AT);
    return typeof ts === 'number' && Date.now() - ts < ACTIVE_WINDOW_MS;
  });
  const [showReview, setShowReview] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackState, setFeedbackState] = useState(
    () => getStorage(`hl_feedback_${getTodayString()}`) ? 'sent' : 'idle'
  );
  // Once-only Listdle rating prompt. Persisted so dismiss = forever; renders
  // only on the results screen and only when the player scored "Solid" or
  // better (avg raw ≥ 640). Outsource the URL to a constant.
  const LISTDLE_URL = "https://listdle.com/games/headlines/";
  const [listdleDismissed, setListdleDismissed] = useState(
    () => !!getStorage("hl_listdle_prompted_v1")
  );
  // Scoring info modal — opened from the verdict label on results, or from
  // the bottom "How is your score worked out?" link. Single modal, two entry
  // points.
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);
  // Menu-triggered feedback modal — accessible from anywhere via the burger
  // menu, in addition to the existing form on the results page.
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  // ── ACCOUNTS (optional email sign-in) ────────────────────────────────────
  // account is null when signed out, or { email } when signed in. streak is
  // derived from the local play history (and merged with the account's on login).
  const [account, setAccount] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInReason, setSignInReason] = useState("streak"); // 'streak' | 'archive'
  const openSignIn = (reason) => { setSignInReason(reason || "streak"); setSignInOpen(true); };
  const [streak, setStreak] = useState(() => deriveStreakLocal(getWeeklyHistory()));
  const [remindOn, setRemindOn] = useState(false);
  // When logged in, the account is the source of truth for "have I played today?"
  // — so the daily is recognised as done across devices, not just on the device
  // it was played on. Holds today's score (display scale) if already played, else null.
  const [remotePlayedToday, setRemotePlayedToday] = useState(null);
  const refreshStreak = () => setStreak(deriveStreakLocal(getWeeklyHistory()));

  // True if THIS device already has today's completed game saved locally.
  function localDoneToday() {
    return getStorage(STORAGE_KEYS.PLAY_DATE) === getTodayString()
      && ['done', 'results'].includes(getStorage('hl_phase'));
  }
  function checkRemotePlayed(weekly) {
    const todayEntry = (weekly || []).find((e) => e.date === getTodayString());
    setRemotePlayedToday(todayEntry && !localDoneToday() ? todayEntry : null);
  }
  // Rebuild today's full results screen from the account's stored guesses +
  // today's edition (the headlines are shared, so guesses are all we need).
  function viewRemoteResults() {
    const g = remotePlayedToday?.guesses;
    if (!Array.isArray(g) || g.length !== daily.length || daily.length === 0) return;
    const rh = Array.isArray(remotePlayedToday?.hints) ? remotePlayedToday.hints : [];
    setGuesses(g);
    setHints(rh);
    setScores(g.map((gy, i) => calcScore(gy, daily[i].year, rh[i])));
    setRemotePlayedToday(null);
    setPhase('results');
  }

  // On load: if a session cookie exists, adopt the account + merge its history.
  useEffect(() => {
    (async () => {
      const d = await auth.me();
      if (d?.user) {
        setAccount(d.user);
        setRemindOn(!!d.remind);
        mergeWeeklyIntoLocal(d.weekly);
        refreshStreak();
        checkRemotePlayed(d.weekly);
        // Backfill tz/country for older accounts (and pick up any server merge).
        const synced = await auth.sync(getWeeklyHistory());
        if (synced) { setRemindOn(!!synced.remind); mergeWeeklyIntoLocal(synced.weekly); refreshStreak(); checkRemotePlayed(synced.weekly); }
      }
    })();
  }, []);

  // Called when the player signs in: adopt account, merge histories, push local
  // history up so the account is complete, refresh the streak.
  async function handleSignedIn(d) {
    setAccount(d.user);
    setRemindOn(!!d.remind);
    mergeWeeklyIntoLocal(d.weekly);
    refreshStreak();
    checkRemotePlayed(d.weekly);
    const synced = await auth.sync(getWeeklyHistory());
    if (synced) { setRemindOn(!!synced.remind); mergeWeeklyIntoLocal(synced.weekly); refreshStreak(); checkRemotePlayed(synced.weekly); }
    // If they already played today, swap their Anonymous board row for their name.
    await refreshLeaderboardMeta();
  }

  // In-app toggle for signed-in users to turn the daily email on/off.
  async function toggleReminders(on) {
    setRemindOn(on); // optimistic
    const d = await auth.sync(getWeeklyHistory(), { remind: on });
    if (d) setRemindOn(!!d.remind);
  }

  // Re-submit today's score so the board meta picks up the player's current
  // name/flag (server resolves the name from the session cookie), then re-pull
  // the board. ZADD NX means the score itself is never overwritten — only the
  // display meta is refreshed. No-op if the player hasn't played today.
  async function refreshLeaderboardMeta() {
    if (leaderboard?.rank == null) return;
    const uuid = getPlayerUUID();
    const date = getTodayString();
    const score = scores.reduce((a, b) => a + b, 0);
    try {
      await fetch('/api/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, score, date }),
      });
      const lb = await fetch(`/api/leaderboard?uuid=${uuid}&date=${date}`).then(r => r.json());
      setLeaderboard(lb);
    } catch {}
  }

  // Inline "add your name" from the leaderboard row (signed-in players).
  async function handleSetName(name) {
    const d = await auth.sync(getWeeklyHistory(), { name });
    if (d?.user) setAccount(d.user);
    await refreshLeaderboardMeta();
  }

  async function handleSignOut() {
    await auth.logout();
    setAccount(null);
    setRemindOn(false);
    setMenuOpen(false);
  }

  // ── PRACTICE MODE ────────────────────────────────────────────────────────
  // appMode is 'daily' (default, persisted to localStorage) or 'practice'
  // (in-memory only, no persistence). On entering practice we snapshot the
  // daily React state into dailySnapshot.current, then restore it on exit.
  const [appMode, setAppMode] = useState('daily');
  const [practiceFilter, setPracticeFilter] = useState(null); // { type, value, label }
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // null | 'decade' | 'category'
  const [practiceManifest, setPracticeManifest] = useState(null);
  const [soundOn, setSoundOn] = useState(() => isSoundOn());
  const dailySnapshot = useRef(null);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setStorage("hl_sound_v1", next);
    if (next) {
      // Gentle confirmation chime when turning on
      playTone(659, 0.12, 0.05);
      setTimeout(() => playTone(988, 0.2, 0.05), 90);
    }
  }

  // Save game state on every change — DAILY MODE ONLY. Practice rounds
  // are session-only and must never overwrite the player's saved daily state.
  useEffect(() => {
    if (appMode !== "daily") return;
    if (phase !== "intro") {
      // Store "done" for both "results" and "done" so returning users see the "already played" screen
      setStorage("hl_phase", phase === "results" ? "done" : phase);
      setStorage("hl_scores", scores);
      setStorage("hl_guesses", guesses);
      setStorage("hl_hints", hints);
      setStorage("hl_idx", idx);
      // Anchor PLAY_DATE so resume works regardless of how the daily
      // headlines came in (cache hit, fresh API, or seed fallback). This is
      // the source of truth for "has the player played today". It must NOT
      // be conflated with TODAY_DATE, which is the headline-cache freshness
      // marker rewritten by getDailyHeadlines on every new day.
      setStorage(STORAGE_KEYS.PLAY_DATE, getTodayString());
      // Persist the headlines the player is playing against so a reload
      // (esp. iOS Safari backgrounding) can't swap them out from under
      // the saved scores/guesses and corrupt the scorecard rendering.
      if (daily.length === 5) {
        setStorage(STORAGE_KEYS.PLAYED_HEADLINES, daily);
      }
      // Heartbeat: refresh "active play" timestamp whenever the player
      // makes progress in an active session. Read on next mount to restore
      // activeSession=true and avoid an unexpected resume-screen bounce.
      if (activeSession) {
        setStorage(STORAGE_KEYS.ACTIVE_PLAY_AT, Date.now());
      }
    }
  }, [phase, scores, guesses, hints, idx, daily, activeSession, appMode]);

  const [aiStatus, setAiStatus] = useState("");

  // Track a page visit once per UTC day per browser. Dedup via localStorage so
  // refreshes within the same day don't inflate the visit count. Fire-and-forget
  // — never blocks rendering or surfaces errors.
  useEffect(() => {
    const day = getTodayString();
    const flagKey = `hl_visited_${day}`;
    if (getStorage(flagKey)) return;
    setStorage(flagKey, true);
    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day }),
    }).catch(() => {});
  }, []);

  // Load today's headlines on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      setAiStatus("Loading today's headlines…");
      // Always fetch what the server says today's edition is — we need it
      // either as the primary source OR as a sanity check against PLAYED_HEADLINES.
      let fresh = null;
      try {
        const { headlines, fromCache } = await getDailyHeadlines();
        if (!fromCache) setAiStatus("Fresh headlines generated ✓");
        fresh = headlines;
      } catch {
        fresh = SEED_HEADLINES.slice(0, 5);
        setAiStatus("Using cached headlines");
      }
      // PLAYED_HEADLINES is the headlines the player actually locked guesses
      // against — preferred so the scorecard always renders consistent with
      // their saved scores/guesses even if the server cache later changes.
      // Safety check: if PLAYED_HEADLINES no longer resembles today's edition
      // (matches < 3 of 5 years), it's likely stale practice-mode content
      // that leaked into daily mode via an old snapshot bug. Recover by
      // using the server's edition and wiping the bad play state.
      const savedPlayed = getStorage(STORAGE_KEYS.PLAYED_HEADLINES);
      const isValidSavedSet =
        validSave &&
        Array.isArray(savedPlayed) &&
        savedPlayed.length === 5 &&
        savedPlayed.every(isValidHeadlineClient);
      // Preserve the exact headlines the player locked guesses against, so a
      // completed / in-progress game ALWAYS survives a refresh — even if the
      // server's current edition differs (e.g. the first play used a seed-fallback
      // edition while the real one was still generating, then the refresh loaded
      // the real one). We used to wipe the game when the two didn't overlap, which
      // silently destroyed a finished score on reload. validSave (PLAY_DATE ===
      // today) is only ever written during real daily play — practice mode is
      // session-only and never touches it — so this can't resurrect stale
      // practice-mode state.
      if (isValidSavedSet) {
        setDaily(savedPlayed);
      } else {
        setDaily(fresh);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Fetch leaderboard if returning to completed game — daily only
  useEffect(() => {
    if (appMode !== 'daily') return;
    if ((phase === 'done' || phase === 'results') && !leaderboard) {
      const uuid = getPlayerUUID();
      fetch(`/api/leaderboard?uuid=${uuid}&date=${getTodayString()}`)
        .then(r => r.json())
        .then(data => setLeaderboard(data))
        .catch(() => {});
    }
  }, [phase, appMode]);

  // Backfill weekly history for players who completed today's game before
  // weekly-history shipped — so their strip isn't blank when they revisit.
  // Daily only — practice rounds never touch weekly history.
  useEffect(() => {
    if (appMode !== 'daily') return;
    if ((phase === 'done' || phase === 'results') && validSave && scores.length > 0 && daily.length > 0 && scores.length >= daily.length) {
      const today = getTodayString();
      const hist = getWeeklyHistory();
      if (!hist.some(e => e.date === today)) {
        pushDailyHistory(today, scores.reduce((a, b) => a + b, 0), guesses, hints);
      }
      refreshStreak();
      // If signed in, push today's result up so the streak is saved server-side.
      if (account) {
        auth.sync(getWeeklyHistory()).then(d => {
          if (d?.weekly) { mergeWeeklyIntoLocal(d.weekly); refreshStreak(); }
        });
      }
    }
  }, [phase, scores, daily.length, validSave, appMode, account]);

  useEffect(() => {
    if (locked) setTimeout(() => setVisible(true), 100);
    else setVisible(false);
  }, [locked]);

  const h      = daily[idx];
  // Per-question scores DERIVED from the currently displayed guesses × years ×
  // hints — not the persisted `scores`, which can drift from the shown edition
  // after a mid-session reload or a deploy blip. Deriving guarantees the big
  // total, the per-row scores, the share card and the shared text can NEVER
  // disagree (the "440 shown for a 342 grid" bug). In a normal completed game
  // this is identical to the saved scores; it only differs in a drift, where it
  // shows the honest value for what's actually on screen. Falls back to the
  // saved scores when the game isn't cleanly complete (e.g. mid-play).
  const gameComplete =
    scores.length === daily.length && daily.length > 0 &&
    guesses.length === daily.length && daily.every((h) => typeof h?.year === "number");
  const shownScores = gameComplete ? daily.map((h, i) => calcScore(guesses[i], h.year, hints[i])) : scores;
  const total  = shownScores.reduce((a, b) => a + b, 0);
  const max    = daily.length * 1000;
  const last   = scores[scores.length - 1];
  const diff   = locked ? year - h?.year : null;
  const pct    = `${(((year - MIN) / (MAX - MIN)) * 100).toFixed(1)}%`;
  const diffStr = diff === 0 ? "Exact year."
    : diff > 0 ? `${Math.abs(diff)} year${Math.abs(diff) > 1 ? "s" : ""} too late.`
    : `${Math.abs(diff)} year${Math.abs(diff) > 1 ? "s" : ""} too early.`;

  function lock() {
    if (locked) return;
    const newScore = calcScore(year, h.year, hintRevealed);
    // Idempotent appends, keyed to `idx`. `if (locked)` alone can't stop a
    // double-fire: `locked` is the stale render-closure value, so two clicks in
    // one tick (a fast double-tap — easy now the hint layout shifts the button)
    // both pass the guard and each append. Guarding on array length vs idx makes
    // the second call a no-op: React applies functional updates in sequence, so
    // the 2nd updater sees the 1st's appended entry and returns it unchanged.
    setScores(s  => s.length > idx ? s : [...s, newScore]);
    setGuesses(g => g.length > idx ? g : [...g, year]);
    setHints(hs  => hs.length > idx ? hs : [...hs, hintRevealed]);
    setLocked(true);
    playScoreSound(newScore);
    // Magic moment: exact year → slam the date-stamp. Auto-clears after the
    // 1.6s animation; pointer-events:none means it never blocks the UI.
    if (year === h.year) {
      setStamp(h.year);
      setStampKey(k => k + 1);
      setTimeout(() => setStamp(null), 1700);
    }
  }

  function advance() {
    if (idx + 1 >= daily.length) {
      setPhase("results"); window.scrollTo({top: 0, behavior: "smooth"});
      const finalAvg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, daily.length));
      // Delay slightly so the final per-question ding finishes first.
      setTimeout(() => playFinalSound(finalAvg), 700);

      // Practice rounds are pure — don't bump any persistent stat.
      if (appMode === "practice") return;

      // `lock()` already appended the final question's score before this runs,
      // so the running total in `scores` is complete. Reconstructing it as
      // [...scores, calcScore(...)] (the old code) double-counted Q5 — which
      // also breaks /api/leaderboard validation when a score nears 5000.
      const finalTotal = scores.reduce((a, b) => a + b, 0);
      pushDailyHistory(getTodayString(), finalTotal, guesses, hints);
      fetch('/api/track-completion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        // guesses feed the per-headline distribution (real "how you compared" + admin difficulty).
        // hints feed hint-usage aggregation in admin (how many players used a clue).
        body: JSON.stringify({ score: finalTotal, date: getTodayString(), guesses, hints })
      }).catch(() => {});

      // Submit to leaderboard, then fetch results
      const uuid = getPlayerUUID();
      const playerDate = getTodayString();
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ uuid, score: finalTotal, date: playerDate })
      })
        .then(() => fetch(`/api/leaderboard?uuid=${uuid}&date=${playerDate}`))
        .then(r => r.json())
        .then(data => setLeaderboard(data))
        .catch(() => {});
    }
    // `i > idx ? i : i + 1` keeps a double-tap on "Next" from advancing twice
    // (which would skip a question); the 2nd call sees the already-incremented idx.
    else { setIdx(i => i > idx ? i : i + 1) || window.scrollTo({top: 0, behavior: "smooth"}); setYear(1970); setLocked(false); setVisible(false); setHintRevealed(false); }
  }

  async function handleShare() {
    const squares = daily.map((h, i) => {
      const diff = guesses[i] - h.year;
      const d = Math.abs(diff);
      const dot = d <= 3 ? "🟩" : d <= 10 ? "🟨" : "🟥";
      const label = d === 0 ? "✓" : `${diff > 0 ? "+" : ""}${diff}`;
      // 💡 marks a hinted question so shared scores stay honest.
      return `${dot}${label}${hints[i] ? "💡" : ""}`;
    }).join("  ");
    const card = `📰 HEADLINES · ${TODAY_SHORT}\n${squares}\n${displayScore(total)} / ${displayScore(max)} · ${getVerdict(Math.round(total / daily.length))} · www.headlines.games`;
    const track = () => fetch('/api/track-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', date: getTodayString() }),
    }).catch(() => {});

    // Mobile: open the native share sheet (one tap to WhatsApp / iMessage / etc).
    // We share text only — the emoji grid + URL stay intact in WhatsApp groups,
    // which is better for spread than an image. Desktop / unsupported browsers
    // fall back to copy-to-clipboard with the existing "Copied" confirmation.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: card });
        track();
        return;
      } catch (e) {
        // User dismissed the share sheet — do nothing, don't fall back to copy.
        if (e && e.name === 'AbortError') return;
        // Any other failure: fall through to the clipboard path below.
      }
    }
    const didCopy = await robustCopy(card);
    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      // Last resort that works on literally every browser (incl. Firefox/Linux
      // with clipboard locked down): show the text in a prompt to copy manually.
      try { window.prompt('Copy your score, then paste anywhere:', card); } catch {}
    }
    track();
  }

  function submitFeedback() {
    const message = feedbackText.trim();
    if (!message || feedbackState !== 'idle') return;
    setFeedbackState('sending');
    const totalNow = scores.reduce((a, b) => a + b, 0);
    // Signed-in players: attach their account email automatically so Tom can
    // reply. Signed-out: use the optional email field if they filled it.
    const replyEmail = account?.email || feedbackEmail.trim() || null;
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, email: replyEmail, score: totalNow, date: getTodayString() }),
    })
      .then(r => {
        if (!r.ok) throw new Error('failed');
        setFeedbackState('sent');
        setStorage(`hl_feedback_${getTodayString()}`, true);
      })
      .catch(() => setFeedbackState('idle'));
  }

  function reset() {
    setPhase("intro"); setIdx(0); setYear(1970);
    setLocked(false); setScores([]); setGuesses([]); setHints([]); setHintRevealed(false); setVisible(false);
  }

  // ── PRACTICE MODE HELPERS ─────────────────────────────────────────────
  function openMenu() {
    setMenuOpen(true);
    // Lazy-load the manifest the first time the menu opens so the picker
    // shows real availability counts immediately when the user drills in.
    if (!practiceManifest) {
      fetch('/api/practice-headlines')
        .then(r => r.json())
        .then(setPracticeManifest)
        .catch(() => setPracticeManifest({ decades: {}, categories: {} }));
    }
  }

  function enterPractice(type, value, label) {
    // Snapshot current daily React state so we can restore it on exit. Only
    // snapshot on the FIRST entry into practice — subsequent enters (e.g.
    // "Play another round" from a practice results screen, which calls back
    // into enterPractice while still in practice mode) would otherwise
    // overwrite the snapshot with practice state, causing exit to restore
    // the wrong `daily` and silently leak practice content into the next
    // daily-mode persistence write.
    if (appMode !== 'practice') {
      dailySnapshot.current = { phase, idx, year, locked, scores, guesses, hints, daily, leaderboard };
    }
    setAppMode('practice');
    setPracticeFilter({ type, value, label });
    setMenuOpen(false);
    setPickerMode(null);

    // Reset game state and fetch the practice round
    setPhase('play');
    setIdx(0); setYear(1970); setLocked(false); setVisible(false);
    setScores([]); setGuesses([]); setHints([]); setHintRevealed(false);
    setActiveSession(true);
    setLoading(true);
    setDaily([]);
    fetch(`/api/practice-headlines?mode=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`)
      .then(r => r.json())
      .then(data => {
        const hs = Array.isArray(data?.headlines) ? data.headlines : [];
        if (hs.length === 0) {
          // No data for this filter — bail back to daily.
          exitPractice();
        } else {
          setDaily(hs);
        }
      })
      .catch(() => exitPractice())
      .finally(() => setLoading(false));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitPractice() {
    const s = dailySnapshot.current;
    setAppMode('daily');
    setPracticeFilter(null);
    setMenuOpen(false);
    setPickerMode(null);
    if (s) {
      setPhase(s.phase);
      setIdx(s.idx);
      setYear(s.year);
      setLocked(s.locked);
      setScores(s.scores);
      setGuesses(s.guesses);
      setHints(s.hints || []); setHintRevealed(false);
      setDaily(s.daily);
      setLeaderboard(s.leaderboard);
      setVisible(false);
      setActiveSession(false);
      dailySnapshot.current = null;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function replayPractice() {
    // Same filter, fresh shuffle from the server
    if (practiceFilter) {
      enterPractice(practiceFilter.type, practiceFilter.value, practiceFilter.label);
    }
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; -webkit-font-smoothing: antialiased; }
    input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 2px; background: linear-gradient(to right, #121212 0%, #121212 var(--p,0%), #e0e0e0 var(--p,0%), #e0e0e0 100%); outline: none; cursor: pointer; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid #121212; cursor: pointer; transition: background .1s, transform .1s; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
    input[type=range]::-webkit-slider-thumb:hover { background: #121212; transform: scale(1.1); }
    input[type=range]:disabled { opacity: .3; cursor: default; }
    .btn { width:100%; padding:16px; background:#121212; color:#fff; border:none; font-family:'Source Serif 4',serif; font-size:12px; letter-spacing:.18em; text-transform:uppercase; cursor:pointer; transition:opacity .15s; }
    .btn:hover { opacity:.85; }
    .btn-ghost { width:100%; padding:15px; background:transparent; color:#121212; border:1.5px solid #121212; font-family:'Source Serif 4',serif; font-size:12px; letter-spacing:.18em; text-transform:uppercase; cursor:pointer; transition:all .15s; }
    .btn-ghost:hover { background:#121212; color:#fff; }
    .btn-green { width:100%; padding:16px; background:#1a7c3a; color:#fff; border:none; font-family:'Source Serif 4',serif; font-size:12px; letter-spacing:.18em; text-transform:uppercase; cursor:pointer; transition:opacity .15s; }
    .btn-green:hover { opacity:.88; }
    .in { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) both; }
    @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
    .pop { animation: pop .35s cubic-bezier(.34,1.4,.64,1) both; }
    @keyframes pop { from { opacity:0; transform:scale(.9); } to { opacity:1; transform:scale(1); } }
    .spin { animation: spin 1s linear infinite; display:inline-block; }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    /* Exact-year "date stamp" — a fixed, click-through overlay so it never
       shifts or covers interactive UI; it just slams on top and fades. */
    .stamp-wrap { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:400; pointer-events:none; }
    .stamp { border:3px double #b91c1c; color:#b91c1c; padding:10px 24px 13px; text-align:center; background:rgba(255,253,247,.10); box-shadow:0 0 10px rgba(185,29,29,.30); animation:stampSlam 1.6s cubic-bezier(.2,.8,.2,1) forwards; }
    @keyframes stampSlam {
      0%   { transform:rotate(-12deg) scale(2.7); opacity:0; }
      12%  { opacity:0; }
      20%  { transform:rotate(-12deg) scale(.88); opacity:1; }
      28%  { transform:rotate(-12deg) scale(1.04); }
      36%  { transform:rotate(-12deg) scale(1); }
      80%  { opacity:1; }
      100% { transform:rotate(-12deg) scale(1); opacity:0; }
    }
  `;

  const wrap  = { background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 20px 80px", minHeight: "100vh", position: "relative" };
  const inner = { width: "100%", maxWidth: 540 };

  // Burger + overlays — same chrome on every screen.
  const chrome = (
    <>
      <NoticeBanner />
      <BurgerButton onClick={openMenu} />
      <MenuOverlay
        open={menuOpen && pickerMode === null}
        onClose={() => setMenuOpen(false)}
        onPickToday={() => { if (appMode === 'practice') exitPractice(); else setMenuOpen(false); }}
        onPickByDecade={() => {
          if (!account) { setMenuOpen(false); openSignIn('archive'); }
          else setPickerMode('decade');
        }}
        onPickByCategory={() => {
          if (!account) { setMenuOpen(false); openSignIn('archive'); }
          else setPickerMode('category');
        }}
        onPickRecent={() => {
          // Extra play modes are a free-account perk. Logged out → prompt sign-in.
          if (!account) { setMenuOpen(false); openSignIn('archive'); }
          else setPickerMode('recent');
        }}
        extrasLocked={!account}
        account={account}
        onSignIn={() => { setMenuOpen(false); openSignIn('streak'); }}
        onSignOut={handleSignOut}
        onPickFeedback={() => { setMenuOpen(false); setFeedbackModalOpen(true); }}
        currentMode={appMode}
        currentLabel={practiceFilter?.label}
        soundOn={soundOn}
        onToggleSound={toggleSound}
      />
      {pickerMode && (
        <PracticePicker
          mode={pickerMode}
          manifest={practiceManifest}
          onPick={enterPractice}
          onBack={() => setPickerMode(null)}
        />
      )}
      <FeedbackModal open={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />
      <SignInModal
        open={signInOpen}
        reason={signInReason}
        onClose={() => setSignInOpen(false)}
        onSignedIn={handleSignedIn}
        getMigrate={() => ({ weekly: getWeeklyHistory() })}
      />
      <DateStamp year={stamp} hitKey={stampKey} />
    </>
  );

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...wrap, justifyContent: "center", textAlign: "center" }}>
      <style>{css}</style>
      {chrome}
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 48, fontWeight: 900, color: "#121212", letterSpacing: "-.02em", marginBottom: 24 }}>HEADLINES</div>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#666", fontStyle: "italic" }}>
        <span className="spin" style={{ marginRight: 8 }}>◌</span>
        {aiStatus}
      </div>
    </div>
  );

  // ── ALREADY PLAYED TODAY, recognised from the ACCOUNT ──────────────────────
  // (e.g. they played on another device — local storage here doesn't know, but
  // their account does. We don't have the per-question breakdown cross-device,
  // so show a concise "already played" screen instead of offering a fresh game.)
  if (appMode === 'daily' && remotePlayedToday != null && (phase === 'intro' || phase === 'play')) {
    return (
      <div style={wrap}>
        <style>{css}</style>
        {chrome}
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, fontWeight: 900, color: "#121212", letterSpacing: "-.02em", marginBottom: 6 }}>HEADLINES</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#666", fontStyle: "italic", marginBottom: 32 }}>{TODAY_LONG}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, color: "#1a7c3a", marginBottom: 10 }}>✓ You've already played today's edition</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 72, fontWeight: 900, color: "#121212", lineHeight: 1 }}>{displayScore(remotePlayedToday.score)}</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#555", marginTop: 4 }}>out of 500</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#666", fontStyle: "italic", marginTop: 26 }}>New headlines in {countdown}</div>
        {Array.isArray(remotePlayedToday.guesses) && remotePlayedToday.guesses.length === daily.length && daily.length > 0 && (
          <button className="btn-green" onClick={viewRemoteResults} style={{ marginTop: 22, width: "min(420px, 90vw)" }}>See your results →</button>
        )}
        <button className="btn" onClick={() => setMenuOpen(true)} style={{ marginTop: 12 }}>Play a past edition →</button>
      </div>
    );
  }

  // ── ALREADY PLAYED (done today, returning to app) ──────────────────────────
  if (appMode === 'daily' && phase === "done" && validSave && scores.length >= daily.length && daily.length > 0) {
    const avg = Math.round(total / daily.length);
    return (
      <div style={wrap}>
        <style>{css}</style>
        {chrome}
        <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "24px 0 18px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(42px,11vw,58px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em", lineHeight: 1 }}>HEADLINES</div>
        </div>
        <div className="in" style={{ ...inner, paddingTop: 40, textAlign: "center" }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: "#555", fontStyle: "italic", marginBottom: 8 }}>Hey Headliner,</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5vw,26px)", fontWeight: 900, color: "#121212", lineHeight: 1.3, marginBottom: 8 }}>You've already played today's edition</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#555", fontStyle: "italic", marginBottom: 30 }}>Come back at midnight for fresh headlines</div>

          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(48px,14vw,72px)", fontWeight: 900, color: "#121212", lineHeight: 1, marginBottom: 4 }}>{displayScore(total)}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#666", fontStyle: "italic" }}>out of {displayScore(max)} · "{getVerdict(avg)}"</div>

          <div style={{ borderTop: "1px solid #e0e0e0", margin: "30px 0" }} />
          <button className="btn" onClick={() => { setPhase("results"); window.scrollTo({top: 0, behavior: "smooth"}); }}>See your results →</button>
          <button onClick={openMenu} style={{ width: "100%", marginTop: 8, padding: "12px", background: "transparent", color: "#555", border: "1px solid #d0d0d0", fontFamily: "'Source Serif 4', serif", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
            Play a previous edition →
          </button>
          <div style={{ textAlign: "center", marginTop: 16, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#666", fontStyle: "italic" }}>New headlines in {countdown}</div>

          <ScoreHistory />
        </div>
      </div>
    );
  }

  // ── CONTINUE (started but not finished — only on return, not during active play) ──
  if (appMode === 'daily' && phase === "play" && validSave && scores.length > 0 && scores.length < daily.length && !activeSession) return (
    <div style={wrap}>
      <style>{css}</style>
      {chrome}
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "24px 0 18px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(42px,11vw,58px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em", lineHeight: 1 }}>HEADLINES</div>
      </div>
      <div className="in" style={{ ...inner, paddingTop: 40, textAlign: "center" }}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: "#555", fontStyle: "italic", marginBottom: 8 }}>Welcome back, Headliner</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5vw,26px)", fontWeight: 900, color: "#121212", lineHeight: 1.3, marginBottom: 8 }}>You've got headlines left to guess</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#555", marginBottom: 30 }}>{scores.length} of {daily.length} completed · {displayScore(total)} / {displayScore(max)} points so far</div>

        <button className="btn" onClick={() => { setActiveSession(true); setLocked(false); setYear(1970); setVisible(false); setHintRevealed(false); window.scrollTo({top: 0, behavior: "smooth"}); }}>Continue playing →</button>
        <div style={{ textAlign: "center", marginTop: 16, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#666", fontStyle: "italic" }}>{TODAY_LONG} · New headlines in {countdown}</div>
      </div>
    </div>
  );

  // ── INTRO (haven't started today) ─────────────────────────────────────────
  if (phase === "intro") return (
    <div style={wrap}>
      <style>{css}</style>
      {chrome}
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "16px 0 12px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(36px,9vw,48px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em", lineHeight: 1 }}>HEADLINES</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, fontStyle: "italic", color: "#555", marginTop: 6 }}>Name the year. Trust your history.</div>
      </div>
      <div style={{ textAlign: "center", padding: "16px 16px 0", width: "100%", maxWidth: 540 }}>
        <img src="/hero.jpg" alt="HEADLINES — guess the year from real newspaper headlines" style={{ width: "clamp(220px, 55%, 360px)", borderRadius: 10, display: "block", margin: "0 auto" }} />
      </div>
      <div className="in" style={{ ...inner, paddingTop: 16 }}>
        {[
          { n: "1", t: "Read the headline",  d: "Five real headlines, no dates — just the words." },
          { n: "2", t: "Guess the year",     d: "Drag the slider. Lose 2 points for every year you're off — spot on scores 100." },
          { n: "3", t: "New every day",      d: "Fresh headlines at midnight. Same edition for all." },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#121212", color: "#fff", fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{s.n}</div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#121212", lineHeight: 1.2 }}>{s.t}</div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#555", lineHeight: 1.4, marginTop: 3 }}>{s.d}</div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #e0e0e0", margin: "4px 0 16px" }} />
        <button className="btn" onClick={() => { setActiveSession(true); setPhase("play"); }}>Play today's edition →</button>
        <button onClick={openMenu} style={{ width: "100%", marginTop: 8, padding: "12px", background: "transparent", color: "#555", border: "1px solid #d0d0d0", fontFamily: "'Source Serif 4', serif", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
          ↺&nbsp;&nbsp;Play a previous edition
        </button>
        <div style={{ textAlign: "center", marginTop: 10, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#666", fontStyle: "italic" }}>{TODAY_LONG} · New headlines in {countdown}</div>
      </div>
    </div>
  );

  // ── PLAY ───────────────────────────────────────────────────────────────────
  if (phase === "play") return (
    <div style={wrap}>
      <style>{css}</style>
      {chrome}
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "10px 0 10px" }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(18px,4.8vw,24px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em", lineHeight: 1 }}>HEADLINES</div>
          {appMode === 'practice' && practiceFilter ? (
            <div style={{ marginTop: 4, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555", fontStyle: "italic" }}>
              Previous edition · <strong style={{ color: "#1a7c3a", fontStyle: "normal" }}>{practiceFilter.label}</strong>
            </div>
          ) : (
            <div style={{ marginTop: 4, fontFamily: "'Source Serif 4', serif", fontSize: 10, color: "#888", fontStyle: "italic", letterSpacing: ".02em" }}>
              {TODAY_MASTHEAD}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#555", flexShrink: 0 }}>Question {idx + 1} of {daily.length}</div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {daily.map((_, i) => <div key={i} style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, background: i <= idx ? "#121212" : "#e0e0e0", transition: "all .3s" }} />)}
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#121212", flexShrink: 0 }}>
            <strong>{displayScore(total)}</strong>
            <span style={{ color: "#666" }}> / 500 pts</span>
          </div>
        </div>
      </div>

      <div key={idx} className="in" style={inner}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 26, paddingBottom: 20 }}>
          <NewspaperIcon size={16} color={h.pubColor} />
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555" }}>{h.publication}</span>
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5.5vw,32px)", fontWeight: 900, lineHeight: 1.2, color: "#121212", paddingBottom: 30, borderBottom: "1px solid #e0e0e0" }}>
          {h.text}
        </div>

        <div style={{ paddingTop: 28 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={yearInput}
            disabled={locked}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              if (locked) return;
              const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
              setYearInput(raw);
              // Update the live year (and slider) only when a complete in-range
              // year is typed. Partial input ("19", "199") just sits in the
              // box until the player finishes.
              if (raw.length === 4) {
                const n = Number(raw);
                if (n >= MIN && n <= MAX) setYear(n);
              }
            }}
            onBlur={() => {
              if (locked) return;
              // Commit: clamp 4-digit out-of-range values to bounds; revert
              // anything partial back to the current year.
              if (yearInput.length === 4) {
                const n = Math.max(MIN, Math.min(MAX, Number(yearInput) || MIN));
                if (n !== year) setYear(n);
                setYearInput(String(n));
              } else {
                setYearInput(String(year));
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            aria-label="Type a year"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(50px,13vw,70px)",
              fontWeight: 900,
              // Red when 4 digits but out of range, so the player sees the
              // problem before blur. Default is normal black.
              color: yearInput.length === 4 && (Number(yearInput) < MIN || Number(yearInput) > MAX) ? "#b91c1c" : "#121212",
              letterSpacing: "-.025em",
              lineHeight: 1,
              marginBottom: 24,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              width: "100%",
              textAlign: "center",
              caretColor: "#121212",
              cursor: locked ? "default" : "text",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => !locked && setYear(y => Math.max(MIN, y - 1))} disabled={locked} style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #d0d0d0", background: "#fff", color: "#121212", fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, cursor: locked ? "default" : "pointer", opacity: locked ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
            <input type="range" min={MIN} max={MAX} value={year} disabled={locked} style={{ "--p": pct, flex: 1 }} onChange={e => setYear(Number(e.target.value))} />
            <button onClick={() => !locked && setYear(y => Math.min(MAX, y + 1))} disabled={locked} style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #d0d0d0", background: "#fff", color: "#121212", fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, cursor: locked ? "default" : "pointer", opacity: locked ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#777", padding: "0 44px" }}>
            <span>1900</span><span>2026</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, marginBottom: 30 }}>
            {[1910,1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020].map(y => (
              <div key={y} style={{ textAlign: "center" }}>
                <div style={{ width: 1, height: y % 20 === 0 ? 7 : 3, background: "#d0d0d0", margin: "0 auto 2px" }} />
                {y % 20 === 0 && <div style={{ fontSize: "clamp(7px,1.8vw,9px)", color: "#777", fontFamily: "'Source Serif 4', serif" }}>{y}</div>}
              </div>
            ))}
          </div>

          {!locked && h.hint && <HintBlock key={idx} hint={h.hint} onReveal={() => setHintRevealed(true)} />}

          {!locked ? (
            <button className="btn" onClick={lock}>Lock in {year} →</button>
          ) : (
            <div style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(10px)", transition: "opacity .35s ease, transform .4s ease" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                <div style={{ flex: 1, padding: "clamp(14px,4vw,20px) 16px", background: "#f7f7f7", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#666", marginBottom: 8 }}>You guessed</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,7vw,40px)", fontWeight: 900, color: "#666", textDecoration: diff !== 0 ? "line-through" : "none" }}>{year}</div>
                </div>
                <div className="pop" style={{ flex: 1, padding: "clamp(14px,4vw,20px) 16px", background: "#121212", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#555", marginBottom: 8 }}>Actual year</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,7vw,40px)", fontWeight: 900, color: "#fff" }}>{h.year}</div>
                </div>
              </div>
              <div style={{ padding: "15px 18px", border: "1px solid #e0e0e0", borderTop: "none", marginBottom: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "clamp(14px,4vw,17px)", color: "#121212" }}>{getVerdict(last)}</span>
                  <span>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,6vw,26px)", fontWeight: 900, color: "#121212" }}>{displayScore(last)}</span>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#666" }}> / 100</span>
                  </span>
                </div>
                <div style={{ height: 3, background: "#e0e0e0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(last / 1000) * 100}%`, background: "#121212", borderRadius: 2, transition: "width .6s ease" }} />
                </div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, fontStyle: "italic", color: diff === 0 ? "#1a7c3a" : "#555", marginTop: 10 }}>{diffStr}</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontStyle: "italic", color: "#666", marginTop: 6 }}>— {editorRemark(diff)}</div>
              </div>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid #e0e0e0", marginBottom: 20 }}>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: "clamp(12px,3vw,14px)", lineHeight: 1.8, color: "#444" }}>{h.context}</div>
              </div>
              <button className="btn" onClick={advance}>{idx + 1 < daily.length ? "Next headline →" : "See results →"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── PRACTICE RESULTS ───────────────────────────────────────────────────────
  if (appMode === 'practice' && phase === 'results') {
    const pAvg = Math.round(total / Math.max(1, daily.length));
    return (
      <div style={wrap}>
        <style>{css}</style>
        {chrome}
        <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "18px 0 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px,6vw,28px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em" }}>HEADLINES</div>
          <div style={{ marginTop: 6, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555", fontStyle: "italic" }}>
            Practice round · <strong style={{ color: "#1a7c3a", fontStyle: "normal" }}>{practiceFilter?.label}</strong>
          </div>
        </div>

        <div className="in" style={{ ...inner, paddingTop: 36 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#666", marginBottom: 10 }}>Your score</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(88px,24vw,140px)", fontWeight: 900, color: "#121212", lineHeight: 1, letterSpacing: "-.04em" }}>{displayScore(total)}</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: "#555", fontStyle: "italic", marginTop: 8 }}>out of {displayScore(max)}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontStyle: "italic", color: "#b91c1c", marginTop: 12 }}>"{getVerdict(pAvg)}"</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            <button className="btn" onClick={replayPractice}>Play another {practiceFilter?.label} round →</button>
            <button className="btn-ghost" onClick={exitPractice}>← Back to today's edition</button>
          </div>

          <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 20 }}>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#666", marginBottom: 16 }}>Headline by headline</div>
            {daily.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f5f5f5", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <NewspaperIcon size={12} color={h.pubColor} />
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#555" }}>{h.publication} · {h.year}</span>
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(12px,3vw,13px)", fontWeight: 700, fontStyle: "italic", color: "#121212", lineHeight: 1.3 }}>"{h.text.split(" ").slice(0, 6).join(" ")}…"</div>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#666", marginTop: 3 }}>
                    Guessed {guesses[i]} — {Math.abs(guesses[i] - h.year) === 0 ? "✓ exact!" : `${Math.abs(guesses[i] - h.year)} yr${Math.abs(guesses[i] - h.year) > 1 ? "s" : ""} off`}
                  </div>
                </div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,6vw,26px)", fontWeight: 900, color: "#121212", flexShrink: 0 }}>{displayScore(shownScores[i])}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 28, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#777", fontStyle: "italic" }}>
            Previous editions don't affect your daily score or streak · www.headlines.games
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────────────────────
  const avg = Math.round(total / daily.length);
  // (Scorecard "drift" is no longer possible to display inconsistently: the
  // total and every per-row score are derived from the shown guesses × years ×
  // hints via `shownScores`, so they can't disagree with the grid.)
  return (
    <div style={wrap}>
      <style>{css}</style>
      {chrome}
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "18px 0 14px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px,6vw,28px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em" }}>HEADLINES</div>
      </div>

      <div className="in" style={{ ...inner, paddingTop: 36 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#666", marginBottom: 10 }}>Today's score</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(88px,24vw,140px)", fontWeight: 900, color: "#121212", lineHeight: 1, letterSpacing: "-.04em" }}>{displayScore(total)}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, color: "#555", fontStyle: "italic", marginTop: 8 }}>out of {displayScore(max)}</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontStyle: "italic", color: "#b91c1c", marginTop: 12 }}>"{getVerdict(avg)}"</div>
          {/* Scoring explainer intentionally NOT here — it lives lower down as
              `ScoringExplainer` so the top of the results page stays focused on
              the score + share loop. Players who want the detail can find it. */}
        </div>

        {/* Share CTA — directly under the score, above the fold (user feedback).
            The growth loop comes first, before weekly history + leaderboard. */}
        <div style={{ marginTop: 4, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn-green" onClick={handleShare}>
            {copied ? "✓  Copied — paste anywhere!" : "📤  Share your score"}
          </button>
          {copied && (
            <div className="in" style={{ textAlign: "center", fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#1a7c3a", fontStyle: "italic" }}>
              Paste it into WhatsApp, iMessage, Twitter…
            </div>
          )}
        </div>

        {/* Secondary CTA — the review/analysis journey. Sits directly under the
            green Share button as a paired primary/secondary action, and uses the
            ghost (outlined) style so it reads as secondary AND never blends into
            the dark history bars that follow it. */}
        <button className="btn-ghost" onClick={() => setShowReview(true) || window.scrollTo({ top: 0, behavior: "smooth" })} style={{ marginBottom: 0 }}>
          Review your answers  →
        </button>

        {/* Score history — promoted above the fold per Mum's feedback. Now a
            W / M / 6M / Y ranged, scrollable chart (Apple-Health style). */}
        <ScoreHistory />

        {/* Daily leaderboard — countries strip, top rows, window around you.
            Daily only (practice rounds never submit a score). */}
        {appMode === "daily" && (
          <Leaderboard data={leaderboard} account={account} onSignIn={openSignIn} onSetName={handleSetName} />
        )}

        {/* Streak + optional account prompt. Daily only. Sits below the share
            CTA so the growth loop always comes first. Purely additive — the game
            is fully playable signed-out. */}
        {appMode === "daily" && (
          account ? (
            <div className="in" style={{ textAlign: "center", fontFamily: "'Source Serif 4', serif", marginBottom: 28 }}>
              <div style={{ fontSize: 14, color: "#1a7c3a" }}>
                {streak >= 1 ? <strong>🔥 {streak}-day streak</strong> : "Signed in"} · ✓ saved to {account.email}
              </div>
              {remindOn ? (
                <div style={{ fontSize: 12.5, color: "#888", marginTop: 6 }}>
                  📬 Daily reminder on · <span onClick={() => toggleReminders(false)} style={{ textDecoration: "underline", cursor: "pointer" }}>turn off</span>
                </div>
              ) : (
                <button onClick={() => toggleReminders(true)} style={{ marginTop: 10, background: "none", border: "1.5px solid #1a7c3a", color: "#1a7c3a", borderRadius: 8, padding: "8px 16px", fontFamily: "'Source Serif 4', serif", fontSize: 13.5, cursor: "pointer" }}>
                  📬 Email me each morning when the new puzzle's ready
                </button>
              )}
            </div>
          ) : (
            <div className="in" style={{ border: "1.5px solid #e3ddcf", background: "#faf7f0", borderRadius: 14, padding: "18px 18px 16px", marginBottom: 28, textAlign: "center", fontFamily: "'Source Serif 4', serif" }}>
              <div style={{ fontSize: streak >= 2 ? 19 : 18, fontWeight: 700, marginBottom: 12 }}>
                {streak >= 2 ? `🔥 ${streak}-day streak` : "📚 Create a free account"}
              </div>
              <div style={{ fontSize: 13.5, color: "#444", lineHeight: 1.95, marginBottom: 14, textAlign: "left", display: "inline-block" }}>
                ✓ Save your streak across devices<br />✓ Unlock every past edition<br />✓ Free · no password · unsubscribe anytime
              </div>
              <button className="btn-green" onClick={() => openSignIn('streak')} style={{ width: "100%" }}>
                {streak >= 2 ? "Save my streak  →" : "Create free account  →"}
              </button>
            </div>
          )
        )}

        {/* Tip jar — a light, plain line (no card) so it doesn't add a third
            cream block under the leaderboard + account card. Lowest-priority
            item, so it stays understated. */}
        <a
          href="https://ko-fi.com/headlinesgame"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", marginBottom: 28, textDecoration: "none", fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#999", fontStyle: "italic" }}
        >
          Headlines is a free passion project — <span style={{ color: "#1a7c3a", fontStyle: "normal", textDecoration: "underline" }}>support it&nbsp;☕</span>
        </a>

        {/* Listdle rating ask — once-only, only when the player scored
            "Very Good" or better (avg raw ≥ 800, total ≥ 400). Higher bar so
            we catch the moment when the player genuinely feels they did well. */}
        {!listdleDismissed && avg >= 800 && (
          <div style={{
            background: "#fdf4e3",
            border: "1px solid #d4a373",
            padding: "14px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, lineHeight: 1.45, color: "#5a3a18", flex: 1 }}>
              <strong style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>Enjoying Headlines?</strong> Rate it ★★★★★ on{" "}
              <a
                href={LISTDLE_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => { setStorage("hl_listdle_prompted_v1", true); setListdleDismissed(true); }}
                style={{ color: "#5a3a18", textDecoration: "underline" }}
              >
                Listdle
              </a>
              {" "}— it helps other players find us.
            </div>
            <button
              onClick={() => { setStorage("hl_listdle_prompted_v1", true); setListdleDismissed(true); }}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "#8a6a3a", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
            >✕</button>
          </div>
        )}

        <div style={{ borderTop: "1px solid #e0e0e0", marginBottom: 24 }} />

        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#666", marginBottom: 14, textAlign: "center" }}>Your score card</div>
        <ShareCard headlines={daily} guesses={guesses} scores={shownScores} hints={hints} />

        {/* Quality signal: only shown to daily players who used a clue, once/day. */}
        {appMode === "daily" && (
          <div style={{ marginTop: 24 }}>
            <HintVote show={Array.isArray(hints) && hints.some(Boolean)} date={getTodayString()} />
          </div>
        )}

        {showReview && <ReviewScreen headlines={daily} guesses={guesses} scores={shownScores} onClose={() => setShowReview(false)} countdown={countdown} onPlayMore={openMenu} />}

        {/* "Headline by headline" list removed — the per-headline detail now
            lives in the Review-your-answers analysis flow (and the score card
            above), so it's no longer duplicated here. */}
        <ScoringExplainer onOpenInfo={() => setScoringInfoOpen(true)} />
        <ScoringInfoModal open={scoringInfoOpen} onClose={() => setScoringInfoOpen(false)} />

        <div style={{ marginTop: 30 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#121212", marginBottom: 10, textAlign: "center" }}>
            How can we make Headlines better?
          </div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#555", marginBottom: 14, textAlign: "center", fontStyle: "italic" }}>
            One idea, one bug, one thing you'd love — we read every reply.
          </div>
          {feedbackState === 'sent' ? (
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#1a7c3a", fontStyle: "italic", padding: "10px 0", textAlign: "center" }}>
              ✓ Thanks — every bit of feedback helps.
            </div>
          ) : (
            <>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value.slice(0, 1000))}
                disabled={feedbackState === 'sending'}
                placeholder="Type your thought…"
                rows={3}
                style={{
                  width: "100%",
                  fontFamily: "'Source Serif 4', serif",
                  fontSize: 14,
                  color: "#121212",
                  padding: "10px 12px",
                  border: "1px solid #e0e0e0",
                  borderRadius: 2,
                  background: "#fafafa",
                  resize: "vertical",
                  outline: "none",
                }}
              />
              {!account && (
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={feedbackEmail}
                  onChange={e => setFeedbackEmail(e.target.value.slice(0, 254))}
                  disabled={feedbackState === 'sending'}
                  placeholder="Email (optional — only if you'd like a reply)"
                  style={{
                    width: "100%", marginTop: 8, fontFamily: "'Source Serif 4', serif",
                    fontSize: 14, color: "#121212", padding: "10px 12px",
                    border: "1px solid #e0e0e0", borderRadius: 2, background: "#fafafa",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              )}
              <button
                onClick={submitFeedback}
                disabled={feedbackState === 'sending' || !feedbackText.trim()}
                style={{
                  marginTop: 8,
                  padding: "10px 18px",
                  fontFamily: "'Source Serif 4', serif",
                  fontSize: 13,
                  border: "1px solid #121212",
                  background: feedbackText.trim() ? "#121212" : "#fff",
                  color: feedbackText.trim() ? "#fff" : "#bbb",
                  cursor: feedbackText.trim() && feedbackState !== 'sending' ? "pointer" : "default",
                  borderRadius: 2,
                  width: "100%",
                  letterSpacing: ".06em",
                }}
              >
                {feedbackState === 'sending' ? "Sending…" : "Send feedback"}
              </button>
            </>
          )}
        </div>

        {/* Permanent Listdle link at the very bottom — quiet, always-on,
            for players who want to find it later without the score gate. */}
        <div style={{ textAlign: "right", marginTop: 22, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#888" }}>
          <a
            href={LISTDLE_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#666", textDecoration: "none", borderBottom: "1px dotted #bbb" }}
          >★ Rate Headlines on Listdle</a>
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#777", fontStyle: "italic" }}>
          New headlines in {countdown} · www.headlines.games
        </div>
      </div>
    </div>
  );
}
