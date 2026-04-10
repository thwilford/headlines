import { useState, useEffect } from "react";

// ── SEED HEADLINES (first 7 days guaranteed, diverse eras & publications) ────
const SEED_HEADLINES = [
  { id: "s1",  text: "MAN WALKS ON MOON; 'ONE GIANT LEAP FOR MANKIND'", year: 1969, publication: "The New York Times", pubColor: "#1a1a1a", context: "Neil Armstrong became the first human to walk on the Moon on July 20, 1969. An estimated 600 million people — one fifth of humanity — watched the broadcast live." },
  { id: "s2",  text: "BERLIN WALL FALLS; EAST GERMANY OPENS ALL BORDERS", year: 1989, publication: "Der Spiegel", pubColor: "#1a1a1a", context: "After 28 years dividing a city and a continent, the Berlin Wall fell on November 9, 1989. Within hours, jubilant crowds began dismantling it with hammers." },
  { id: "s3",  text: "TITANIC FOUNDERED AT 2:20 A.M.; 1,500 TO 1,800 DEAD", year: 1912, publication: "The New York Times", pubColor: "#1a1a1a", context: "The RMS Titanic sank in the North Atlantic on April 15, 1912, after striking an iceberg on her maiden voyage." },
  { id: "s4",  text: "CHERNOBYL REACTOR EXPLODES; RADIOACTIVE CLOUD ENGULFS CONTINENT", year: 1986, publication: "The Guardian", pubColor: "#0a4a7c", context: "Reactor No. 4 at the Chernobyl nuclear plant exploded on April 26, 1986, releasing 400 times more radiation than the Hiroshima bomb." },
  { id: "s5",  text: "LEHMAN BROTHERS COLLAPSES IN LARGEST BANKRUPTCY IN HISTORY", year: 2008, publication: "Financial Times", pubColor: "#c8500a", context: "Lehman Brothers filed for Chapter 11 bankruptcy on September 15, 2008, triggering the worst global financial crisis since the Great Depression." },
  { id: "s6",  text: "WORLD HEALTH ORGANISATION DECLARES GLOBAL PANDEMIC", year: 2020, publication: "The Guardian", pubColor: "#0a4a7c", context: "The WHO declared COVID-19 a global pandemic on March 11, 2020. It would go on to cause over 7 million confirmed deaths worldwide." },
  { id: "s7",  text: "NELSON MANDELA WALKS FREE AFTER 27 YEARS IN PRISON", year: 1990, publication: "The Guardian", pubColor: "#0a4a7c", context: "Nelson Mandela was released from Victor Verster Prison on February 11, 1990, marking the beginning of the end of apartheid in South Africa." },
  { id: "s8",  text: "ALLIES LAND IN FRANCE; GREAT INVASION IS ON", year: 1944, publication: "Chicago Tribune", pubColor: "#1a1a1a", context: "D-Day — June 6, 1944 — saw 156,000 Allied troops storm the beaches of Normandy in the largest seaborne invasion in history." },
  { id: "s9",  text: "SOVIET UNION CEASES TO EXIST; GORBACHEV RESIGNS", year: 1991, publication: "Washington Post", pubColor: "#1a1a1a", context: "On December 25, 1991, Mikhail Gorbachev resigned and the USSR formally ceased to exist. Fifteen independent nations emerged overnight." },
  { id: "s10", text: "YURI GAGARIN BECOMES FIRST HUMAN IN SPACE", year: 1961, publication: "The Times", pubColor: "#8b1a1a", context: "Soviet cosmonaut Yuri Gagarin completed one orbit of Earth on April 12, 1961. The flight lasted 108 minutes." },
  { id: "s11", text: "FIRST SUCCESSFUL POWERED AEROPLANE FLIGHT ACHIEVED", year: 1903, publication: "The Daily Telegraph", pubColor: "#1a1a1a", context: "The Wright Brothers made the first sustained powered flight at Kitty Hawk on December 17, 1903. The longest flight lasted 59 seconds." },
  { id: "s12", text: "WORLD'S FIRST TEST-TUBE BABY BORN; A NEW ERA FOR MEDICINE", year: 1978, publication: "Daily Mirror", pubColor: "#1a1a1a", context: "Louise Brown, the world's first IVF baby, was born on July 25, 1978. The breakthrough transformed reproductive medicine worldwide." },
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
const STORAGE_KEYS = {
  USED_IDS:       "hl_used_ids",
  POOL:           "hl_pool",
  TODAY_DATE:     "hl_today_date",
  TODAY_HEADLINES:"hl_today_headlines",
  STREAK:         "hl_streak",
  LAST_PLAYED:    "hl_last_played",
};

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

function getTodayString() {
  return new Date().toISOString().split("T")[0];
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
  if (cachedDate === today && cachedHL?.length === 5) {
    return { headlines: cachedHL, fromCache: true };
  }

  // Always fetch fresh AI headlines for today
  const usedIds = getStorage(STORAGE_KEYS.USED_IDS, []);
  const usedTexts = usedIds.slice(-50);

  try {
    const response = await fetch('/api/generate-headlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usedTexts }),
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

  // Fallback to seed headlines only if API fails
  const todaysHeadlines = SEED_HEADLINES.slice(0, 5);
  setStorage(STORAGE_KEYS.TODAY_DATE, today);
  setStorage(STORAGE_KEYS.TODAY_HEADLINES, todaysHeadlines);
  return { headlines: todaysHeadlines, fromCache: false };
}

// ── GAME CONSTANTS ───────────────────────────────────────────────────────────
const MIN = 1900, MAX = 2026;
const TODAY_LONG  = new Date().toLocaleDateString("en-US", { month: "long",  day: "numeric", year: "numeric" });
const TODAY_SHORT = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

function calcScore(guess, actual) {
  const d = Math.abs(guess - actual);
  if (d === 0) return 1000; if (d <= 1) return 930; if (d <= 2) return 860;
  if (d <= 4) return 760;   if (d <= 7) return 620; if (d <= 12) return 460;
  if (d <= 20) return 280;  if (d <= 35) return 140;
  return Math.max(0, 80 - d);
}

function getVerdict(avg) {
  if (avg >= 900) return "Extraordinary"; if (avg >= 750) return "Exceptional";
  if (avg >= 550) return "Solid";         if (avg >= 350) return "Reasonable";
  return "Wide of the mark";
}

function dotColor(d) {
  if (d <= 3)  return "#1a7c3a";
  if (d <= 10) return "#b8860b";
  return "#b91c1c";
}

// ── SHARE CARD ───────────────────────────────────────────────────────────────
function ShareCard({ headlines, guesses, scores }) {
  const total  = scores.reduce((a, b) => a + b, 0);
  const max    = headlines.length * 1000;
  const avg    = Math.round(total / headlines.length);
  const toPos  = y => ((y - MIN) / (MAX - MIN)) * 100;

  return (
    <div style={{ background: "#fff", border: "2px solid #121212", maxWidth: 360, margin: "0 auto", fontFamily: "'Georgia', serif" }}>
      <div style={{ background: "#121212", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}>HEADLINES</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#888", fontStyle: "italic" }}>{TODAY_SHORT}</div>
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
                  {!exact && <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#888", fontStyle: "italic" }}>guessed {guesses[i]}</div>}
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
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#aaa", marginTop: 2 }}>headlines.games</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, color: "#121212", lineHeight: 1 }}>{total.toLocaleString()}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#aaa" }}>/ {max.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #e0e0e0", padding: "8px 20px", display: "flex", gap: 16 }}>
        {[{ c: "#1a7c3a", l: "≤ 3 yrs" }, { c: "#b8860b", l: "≤ 10 yrs" }, { c: "#b91c1c", l: "> 10 yrs" }].map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: x.c }} />
            <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 9, color: "#aaa" }}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────

// ── REVIEW SCREEN ─────────────────────────────────────────────────────────────
function getSimulatedStats(year, score) {
  const seed = year % 97;
  const within1  = Math.floor(8  + (seed * 7)  % 12);
  const within5  = Math.floor(31 + (seed * 13) % 28);
  const within10 = Math.floor(58 + (seed * 11) % 22);
  return { within1, within5, within10 };
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
        {[1920,1960,2000].map(y => <div key={y} style={{ fontFamily: "'Source Serif 4', serif", fontSize: 9, color: "#ccc" }}>{y}</div>)}
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

function ReviewScreen({ headlines, guesses, scores, onClose }) {
  const [idx, setIdx] = useState(0);
  const h = headlines[idx];
  const g = guesses[idx];
  const s = scores[idx];
  const diff = Math.abs(g - h.year);
  const stats = getSimulatedStats(h.year, s);
  const diffLabel = diff === 0 ? "Exact year — extraordinary." : diff === 1 ? "Just 1 year off." : diff <= 5 ? `${diff} years off — very close.` : diff <= 15 ? `${diff} years off.` : `${diff} years off — wide of the mark.`;
  const col = diff === 0 ? "#1a7c3a" : diff <= 5 ? "#2563a8" : "#b91c1c";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 100, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0 14px", borderBottom: "1px solid #e0e0e0", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 900, color: "#121212" }}>HEADLINE BY HEADLINE</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#888", cursor: "pointer" }}>✕ Close</button>
        </div>

        {/* Dot nav */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
          {headlines.map((_, i) => <div key={i} onClick={() => setIdx(i)} style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, background: i === idx ? "#121212" : "#ddd", cursor: "pointer", transition: "all .2s" }} />)}
        </div>

        {/* Publication + year */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 3, height: 16, background: h.pubColor, borderRadius: 1 }} />
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#888" }}>{h.publication} · {h.year}</span>
        </div>

        {/* Headline */}
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(16px,4.5vw,20px)", fontWeight: 900, color: "#121212", lineHeight: 1.3, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #e0e0e0" }}>
          {h.text}
        </div>

        {/* Your result */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 4 }}>Your result</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: col, fontStyle: "italic" }}>{diffLabel}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, color: "#121212", lineHeight: 1 }}>{s}</div>
            <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#bbb" }}>/ 1,000</div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 10 }}>Your guess on the timeline</div>
          <Timeline guessYear={g} actualYear={h.year} />
        </div>

        {/* Simulated player stats */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 20 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 14 }}>How all players did</div>
          {[
            { label: "Exact year", pct: stats.within1, color: "#1a7c3a" },
            { label: "Within 5 years", pct: stats.within5, color: "#2563a8" },
            { label: "Within 10 years", pct: stats.within10, color: "#888" },
          ].map((row, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#444" }}>{row.label}</span>
                <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, fontWeight: 600, color: row.color }}>{row.pct}%</span>
              </div>
              <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${row.pct}%`, background: row.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Context */}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 10 }}>The story</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13.5, lineHeight: 1.8, color: "#444" }}>{h.context}</div>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10 }}>
          {idx > 0 && <button onClick={() => setIdx(idx - 1) || window.scrollTo({top: 0, behavior: "smooth"})} style={{ flex: 1, padding: "12px", border: "1px solid #e0e0e0", background: "#fff", fontFamily: "'Source Serif 4', serif", fontSize: 13, cursor: "pointer", borderRadius: 2 }}>← Previous</button>}
          {idx < headlines.length - 1
            ? <button onClick={() => setIdx(idx + 1)} style={{ flex: 1, padding: "12px", background: "#121212", color: "#fff", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 13, cursor: "pointer", borderRadius: 2 }}>Next headline →</button>
            : <button onClick={onClose} style={{ flex: 1, padding: "12px", background: "#121212", color: "#fff", border: "none", fontFamily: "'Source Serif 4', serif", fontSize: 13, cursor: "pointer", borderRadius: 2 }}>Done</button>
          }
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loading,  setLoading]  = useState(true);
  const [daily,    setDaily]    = useState([]);
  const today0 = getTodayString();
  const savedDate = getStorage("hl_today_date");
  const validSave = savedDate === today0;
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    function calc() {
      const now = new Date();
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
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
  const [idx,      setIdx]      = useState(validSave ? (getStorage("hl_idx") || 0) : 0);
  const [year,     setYear]     = useState(1970);
  const [locked,   setLocked]   = useState(false);
  const [scores,   setScores]   = useState(validSave ? (getStorage("hl_scores") || []) : []);
  const [guesses,  setGuesses]  = useState(validSave ? (getStorage("hl_guesses") || []) : []);
  const [visible,  setVisible]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [leaderboard, setLeaderboard] = useState(null);

  // Save game state on every change
  useEffect(() => {
    if (phase !== "intro") {
      setStorage("hl_phase", phase);
      setStorage("hl_scores", scores);
      setStorage("hl_guesses", guesses);
      setStorage("hl_idx", idx);
    }
  }, [phase, scores, guesses, idx]);

  const [aiStatus, setAiStatus] = useState("");

  // Load today's headlines on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      setAiStatus("Loading today's headlines…");
      try {
        const { headlines, fromCache } = await getDailyHeadlines();
        if (!fromCache) setAiStatus("Fresh headlines generated ✓");
        setDaily(headlines);
      } catch {
        // Fallback to first 5 seeds
        setDaily(SEED_HEADLINES.slice(0, 5));
        setAiStatus("Using cached headlines");
      }
      setLoading(false);
    }
    load();
  }, []);

  // Fetch leaderboard if returning to completed game
  useEffect(() => {
    if (phase === 'done' && !leaderboard) {
      const uuid = getPlayerUUID();
      fetch(`/api/leaderboard?uuid=${uuid}`)
        .then(r => r.json())
        .then(data => setLeaderboard(data))
        .catch(() => {});
    }
  }, [phase]);

  useEffect(() => {
    if (locked) setTimeout(() => setVisible(true), 100);
    else setVisible(false);
  }, [locked]);

  const h      = daily[idx];
  const total  = scores.reduce((a, b) => a + b, 0);
  const max    = daily.length * 1000;
  const last   = scores[scores.length - 1];
  const diff   = locked ? year - h?.year : null;
  const pct    = `${(((year - MIN) / (MAX - MIN)) * 100).toFixed(1)}%`;
  const diffStr = diff === 0 ? "Exact year."
    : diff > 0 ? `${Math.abs(diff)} year${Math.abs(diff) > 1 ? "s" : ""} too late.`
    : `${Math.abs(diff)} year${Math.abs(diff) > 1 ? "s" : ""} too early.`;

  function lock() {
    if (locked) return;
    setScores(s  => [...s, calcScore(year, h.year)]);
    setGuesses(g => [...g, year]);
    setLocked(true);
  }

  function advance() {
    if (idx + 1 >= daily.length) {
      setPhase("done"); window.scrollTo({top: 0, behavior: "smooth"});
      const finalTotal = [...scores, calcScore(year, daily[idx].year)].reduce((a,b) => a+b, 0);
      fetch('/api/track-completion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ score: finalTotal, date: getTodayString() })
      }).catch(() => {});

      // Submit to leaderboard, then fetch results
      const uuid = getPlayerUUID();
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ uuid, score: finalTotal })
      })
        .then(() => fetch(`/api/leaderboard?uuid=${uuid}`))
        .then(r => r.json())
        .then(data => setLeaderboard(data))
        .catch(() => {});
    }
    else { setIdx(i => i + 1) || window.scrollTo({top: 0, behavior: "smooth"}); setYear(1970); setLocked(false); setVisible(false); }
  }

  function handleShare() {
    const lines = daily.map((h, i) => {
      const diff = guesses[i] - h.year;
      const d = Math.abs(diff);
      const dot = d <= 3 ? "🟩" : d <= 10 ? "🟨" : "🟥";
      const label = d === 0 ? "✓" : `${diff > 0 ? "+" : ""}${diff}yr`;
      return `${dot}  ${label}`;
    });
    const card = [`📰 HEADLINES — ${TODAY_SHORT}`, "", ...lines, "", `${total.toLocaleString()} / ${max.toLocaleString()}  ·  ${getVerdict(Math.round(total / daily.length))}`, "www.headlines.games"].join("\n");
    navigator.clipboard?.writeText(card);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function reset() {
    setPhase("intro"); setIdx(0); setYear(1970);
    setLocked(false); setScores([]); setGuesses([]); setVisible(false);
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
  `;

  const wrap  = { background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 20px 80px", minHeight: "100vh" };
  const inner = { width: "100%", maxWidth: 540 };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...wrap, justifyContent: "center", textAlign: "center" }}>
      <style>{css}</style>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 48, fontWeight: 900, color: "#121212", letterSpacing: "-.02em", marginBottom: 24 }}>HEADLINES</div>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 14, color: "#aaa", fontStyle: "italic" }}>
        <span className="spin" style={{ marginRight: 8 }}>◌</span>
        {aiStatus}
      </div>
    </div>
  );

  // ── INTRO ──────────────────────────────────────────────────────────────────
  if (phase === "intro") return (
    <div style={wrap}>
      <style>{css}</style>
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "24px 0 18px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(42px,11vw,58px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em", lineHeight: 1 }}>HEADLINES</div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, fontStyle: "italic", color: "#888", marginTop: 10 }}>Name the year. Trust your history.</div>
      </div>
      <div className="in" style={{ ...inner, paddingTop: 40 }}>
        {[
          { n: "1", t: "Read the headline",  d: "Five real headlines from history's greatest newspapers. Dates and bylines removed — just the words." },
        { n: "2", t: "Guess the year",      d: "Drag the slider to your best estimate. Up to 1,000 points per headline — the closer you are, the more you score." },
        { n: "3", t: "New every day",       d: "A fresh set of five headlines every day at midnight. Everyone plays the same edition." },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "flex-start" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#121212", color: "#fff", fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: "#121212", marginBottom: 4 }}>{s.t}</div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#666", lineHeight: 1.65 }}>{s.d}</div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #e0e0e0", margin: "8px 0 30px" }} />
        <button className="btn" onClick={() => setPhase("play")}>Play today's edition →</button>
        <div style={{ textAlign: "center", marginTop: 16, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#bbb", fontStyle: "italic" }}>{TODAY_LONG} · New headlines in {countdown}</div>
      </div>
    </div>
  );

  // ── PLAY ───────────────────────────────────────────────────────────────────
  if (phase === "play") return (
    <div style={wrap}>
      <style>{css}</style>
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "18px 0 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5vw,26px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em" }}>HEADLINES</div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {daily.map((_, i) => <div key={i} style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, background: i <= idx ? "#121212" : "#e0e0e0", transition: "all .3s" }} />)}
        </div>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#aaa" }}>{idx + 1} / {daily.length}</div>
      </div>

      <div key={idx} className="in" style={inner}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 26, paddingBottom: 20 }}>
          <div style={{ width: 3, height: 15, background: h.pubColor, borderRadius: 1 }} />
          <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#555" }}>{h.publication}</span>
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,5.5vw,32px)", fontWeight: 900, lineHeight: 1.2, color: "#121212", paddingBottom: 30, borderBottom: "1px solid #e0e0e0" }}>
          {h.text}
        </div>

        <div style={{ paddingTop: 28 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(50px,13vw,70px)", fontWeight: 900, color: "#121212", letterSpacing: "-.025em", lineHeight: 1, marginBottom: 24 }}>{year}</div>
          <input type="range" min={MIN} max={MAX} value={year} disabled={locked} style={{ "--p": pct }} onChange={e => setYear(Number(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#ccc" }}>
            <span>1900</span><span>2026</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, marginBottom: 30 }}>
            {[1910,1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020].map(y => (
              <div key={y} style={{ textAlign: "center" }}>
                <div style={{ width: 1, height: y % 20 === 0 ? 7 : 3, background: "#d0d0d0", margin: "0 auto 2px" }} />
                {y % 20 === 0 && <div style={{ fontSize: "clamp(7px,1.8vw,9px)", color: "#ccc", fontFamily: "'Source Serif 4', serif" }}>{y}</div>}
              </div>
            ))}
          </div>

          {!locked ? (
            <button className="btn" onClick={lock}>Lock in {year} →</button>
          ) : (
            <div style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(10px)", transition: "opacity .35s ease, transform .4s ease" }}>
              <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                <div style={{ flex: 1, padding: "clamp(14px,4vw,20px) 16px", background: "#f7f7f7", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>You guessed</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,7vw,40px)", fontWeight: 900, color: "#bbb", textDecoration: diff !== 0 ? "line-through" : "none" }}>{year}</div>
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
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,6vw,26px)", fontWeight: 900, color: "#121212" }}>{last}</span>
                    <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#bbb" }}> pts</span>
                  </span>
                </div>
                <div style={{ height: 3, background: "#e0e0e0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(last / 1000) * 100}%`, background: "#121212", borderRadius: 2, transition: "width .6s ease" }} />
                </div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 12, fontStyle: "italic", color: diff === 0 ? "#1a7c3a" : "#999", marginTop: 10 }}>{diffStr}</div>
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

  // ── RESULTS ────────────────────────────────────────────────────────────────
  const avg = Math.round(total / daily.length);
  return (
    <div style={wrap}>
      <style>{css}</style>
      <div style={{ ...inner, borderBottom: "1px solid #e0e0e0", padding: "18px 0 14px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px,6vw,28px)", fontWeight: 900, color: "#121212", letterSpacing: "-.02em" }}>HEADLINES</div>
      </div>

      <div className="in" style={{ ...inner, paddingTop: 36 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#aaa", marginBottom: 10 }}>Today's score</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(64px,17vw,92px)", fontWeight: 900, color: "#121212", lineHeight: 1, letterSpacing: "-.03em" }}>{total.toLocaleString()}</div>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#aaa", fontStyle: "italic", marginTop: 5 }}>out of {max.toLocaleString()}</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontStyle: "italic", color: "#b91c1c", marginTop: 12 }}>"{getVerdict(avg)}"</div>
        </div>

        <div style={{ borderTop: "1px solid #e0e0e0", marginBottom: 24 }} />

        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#aaa", marginBottom: 14, textAlign: "center" }}>Your score card</div>
        <ShareCard headlines={daily} guesses={guesses} scores={scores} />

        {leaderboard && leaderboard.totalPlayers > 0 && (
          <div style={{ borderTop: "1px solid #e0e0e0", marginTop: 20, paddingTop: 20, marginBottom: 4 }}>
            {leaderboard.percentile !== undefined && (
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>Today's leaderboard</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, color: "#121212", lineHeight: 1 }}>
                  {leaderboard.totalPlayers > 1
                    ? `Better than ${leaderboard.percentile}%`
                    : "First player today!"}
                </div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, color: "#888", fontStyle: "italic", marginTop: 4 }}>
                  {leaderboard.totalPlayers > 1
                    ? `#${leaderboard.rank} of ${leaderboard.totalPlayers} players today`
                    : "Check back later to see how you compare"}
                </div>
              </div>
            )}
            {leaderboard.top10?.length > 0 && (
              <div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 10 }}>Top 10</div>
                {leaderboard.top10.map((entry, i) => {
                  const isPlayer = leaderboard.playerScore === entry.score && leaderboard.rank === entry.rank;
                  return (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 10px", background: isPlayer ? "#f5f5f0" : "transparent",
                      borderRadius: 2, marginBottom: 2,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 900, color: i < 3 ? "#b8860b" : "#888", width: 22 }}>
                          {entry.rank}
                        </div>
                        {isPlayer && <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#1a7c3a", fontStyle: "italic" }}>You</div>}
                      </div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 900, color: "#121212" }}>
                        {entry.score.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn-green" onClick={handleShare}>
            {copied ? "✓  Copied — paste anywhere!" : "📋  Copy & share your score"}
          </button>
          {copied && (
            <div className="in" style={{ textAlign: "center", fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#1a7c3a", fontStyle: "italic" }}>
              Paste it into WhatsApp, iMessage, Twitter…
            </div>
          )}
          <button className="btn-ghost" onClick={reset}>Play again</button>
        </div>

        {showReview && <ReviewScreen headlines={daily} guesses={guesses} scores={scores} onClose={() => setShowReview(false)} />}

        <div style={{ borderTop: "1px solid #e0e0e0", marginTop: 30, paddingTop: 20 }}>
          <button onClick={() => setShowReview(true) || window.scrollTo({top: 0, behavior: "smooth"})} style={{ width: "100%", padding: "12px", border: "1px solid #e0e0e0", background: "#fff", fontFamily: "'Source Serif 4', serif", fontSize: 13, cursor: "pointer", borderRadius: 2, marginBottom: 20, color: "#121212" }}>📖 Review today's headlines</button>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#aaa", marginBottom: 16 }}>Headline by headline</div>
          {daily.map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f5f5f5", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 2, height: 10, background: h.pubColor, borderRadius: 1, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#888" }}>{h.publication} · {h.year}</span>
                </div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(12px,3vw,13px)", fontWeight: 700, fontStyle: "italic", color: "#121212", lineHeight: 1.3 }}>"{h.text.split(" ").slice(0, 6).join(" ")}…"</div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 11, color: "#aaa", marginTop: 3 }}>
                  Guessed {guesses[i]} — {Math.abs(guesses[i] - h.year) === 0 ? "✓ exact!" : `${Math.abs(guesses[i] - h.year)} yr${Math.abs(guesses[i] - h.year) > 1 ? "s" : ""} off`}
                </div>
              </div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px,6vw,26px)", fontWeight: 900, color: "#121212", flexShrink: 0 }}>{scores[i]}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontFamily: "'Source Serif 4', serif", fontSize: 12, color: "#ccc", fontStyle: "italic" }}>
          New headlines in {countdown} · www.headlines.games
        </div>
      </div>
    </div>
  );
}
