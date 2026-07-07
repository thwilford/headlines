import { useEffect, useState } from "react";

const PASSWORD = "Headlines";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// "2026-05-24" → "Thu 24th May 2026". Parsed as a local date (no TZ shift) and
// given an ordinal suffix, matching the masthead style on the game itself.
function formatAdminDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = d.getDate();
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" });
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday} ${day}${suffix} ${month} ${d.getFullYear()}`;
}

// Convert ISO 3166 alpha-2 country code → flag emoji (🇬🇧 from "GB").
// "XX" means unknown (local dev / bot / Vercel header missing).
function flagEmoji(cc) {
  if (!cc || cc === "XX" || cc.length !== 2) return "🏳️";
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;
function countryName(cc) {
  if (!cc || cc === "XX") return "Unknown";
  try { return regionNames?.of(cc) || cc; } catch { return cc; }
}

function BudgetCard({ usage, spend }) {
  // `spend` (Anthropic Admin API) is the source of truth. `usage` (local refill log)
  // shows what THIS app spent specifically — useful as a sub-stat.
  if (!usage && !spend) return null;

  const headlinesSpent = usage?.spent || 0;
  const headlinesRefills = usage?.refills || 0;

  return (
    <div className="admin-card" style={{ border: "1px solid #ddd", borderRadius: 6, padding: "16px 18px", marginBottom: 24, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 13, letterSpacing: ".08em", color: "#777", textTransform: "uppercase" }}>Anthropic spend this month</div>
        <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#555" }}>console ↗</a>
      </div>

      {spend?.configured === false ? (
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          <div style={{ marginBottom: 6 }}><b>Live sync not set up yet.</b></div>
          <div>{spend.error}</div>
        </div>
      ) : spend?.error ? (
        <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
          Couldn't reach the Admin API: {spend.error}
        </div>
      ) : spend?.monthSpendDollars != null ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <div className="admin-card-big" style={{ fontSize: 32, fontWeight: "bold", color: "#121212" }}>${spend.monthSpendDollars.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: "#555" }}>across all apps this month</div>
          </div>
          {spend.lastUpdated && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Live from Anthropic · last fetched {new Date(spend.lastUpdated).toLocaleTimeString()}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#555" }}>Loading…</div>
      )}

      <div style={{ borderTop: "1px solid #eee", marginTop: 14, paddingTop: 10, fontSize: 12, color: "#666" }}>
        <span style={{ color: "#666" }}>Of which Headlines refills (this app only):</span>
        {" "}<b style={{ color: "#121212" }}>${headlinesSpent.toFixed(2)}</b>
        <span style={{ color: "#666" }}> · {headlinesRefills} refill{headlinesRefills === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

function CountryList({ counts }) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((n, [, v]) => n + v, 0);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
        🌍 {entries.length} {entries.length === 1 ? "country" : "countries"} ({total} completions):
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13 }}>
        {entries.map(([cc, n]) => (
          <span key={cc}>
            {flagEmoji(cc)} {countryName(cc)} — <b>{n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// Decide which x-axis tick labels to show so they don't crowd/wrap.
// Always show the first and last; show every Nth in between aiming for ~10 visible.
function shouldShowLabel(i, total) {
  if (total <= 1) return true;
  if (i === 0 || i === total - 1) return true;
  const step = Math.max(1, Math.ceil(total / 10));
  return i % step === 0;
}

function DailyChart({ chartDays, values, max, color = "#121212", height = 160, showValues = true }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
        {chartDays.map((date, i) => {
          const v = values[i];
          const pct = (v / max) * 100;
          return (
            <div key={date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {showValues && <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{v || ""}</div>}
              <div style={{ width: "100%", maxWidth: 40, background: color, borderRadius: "3px 3px 0 0", height: `${Math.max(pct, v > 0 ? 2 : 0)}%` }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {chartDays.map((date, i) => (
          <div key={date} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#666", marginTop: 4, whiteSpace: "nowrap", overflow: "visible" }}>
            {shouldShowLabel(i, chartDays.length) ? date.slice(5) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// Range selector — keeps the charts on screen on mobile by trimming the
// horizontal day list. "All time" is the original behaviour; the others
// slice the most recent N days. Picking a month gives a clean per-month view.
const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
  { value: "month", label: "By month", days: null }, // resolves to selected month
];

function AnalyticsTab({ stats, countriesAllTime }) {
  const allDays = Object.keys(stats || {}).sort().reverse();
  const [range, setRange] = useState("30");
  // For "By month": which month? Defaults to most-recent month with data.
  const monthsAvailable = [...new Set(allDays.map(d => d.slice(0, 7)))].sort().reverse();
  const [selectedMonth, setSelectedMonth] = useState(monthsAvailable[0] || "");

  // Filter days based on the selected range.
  let days;
  if (range === "all") {
    days = allDays;
  } else if (range === "month") {
    days = allDays.filter(d => d.startsWith(selectedMonth));
  } else {
    const n = parseInt(range, 10);
    days = allDays.slice(0, n);
  }
  const chartDays = [...days].reverse();

  const visitCounts = chartDays.map(d => stats[d].visits || 0);
  const playerCounts = chartDays.map(d => stats[d].completions);
  const shareCounts = chartDays.map(d => (stats[d].imageShares || 0) + (stats[d].textShares || 0));
  // Average score per day, on the player-facing /500 scale (raw is /5000).
  // Useful for spotting whether editions have been harder or easier over time.
  const avgScores = chartDays.map(d => stats[d].completions > 0 ? Math.round((stats[d].totalScore || 0) / stats[d].completions / 10) : 0);
  const maxVisits = Math.max(...visitCounts, 1);
  const maxPlayers = Math.max(...playerCounts, 1);
  const maxShares = Math.max(...shareCounts, 1);
  const anyVisits = visitCounts.some(n => n > 0);
  const anyShares = shareCounts.some(n => n > 0);
  const anyScores = avgScores.some(n => n > 0);

  // Per-country completions over the selected range → pick the top countries to
  // chart, so we can see which are rising/falling.
  const countryTotals = {};
  for (const d of chartDays) {
    const c = stats[d].countries || {};
    for (const cc in c) countryTotals[cc] = (countryTotals[cc] || 0) + (c[cc] || 0);
  }
  const topCountries = Object.entries(countryTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);

  // Roll-up totals across the selected range
  const totalVisits = visitCounts.reduce((a, b) => a + b, 0);
  const totalCompletions = playerCounts.reduce((a, b) => a + b, 0);
  const totalShares = shareCounts.reduce((a, b) => a + b, 0);
  // Hint signals across the range.
  const totalHintGames = chartDays.reduce((a, d) => a + (stats[d].hintGames || 0), 0);
  const totalHintUses = chartDays.reduce((a, d) => a + (stats[d].hintUses || 0), 0);
  const totalHintUp = chartDays.reduce((a, d) => a + (stats[d].hintVoteUp || 0), 0);
  const totalHintDown = chartDays.reduce((a, d) => a + (stats[d].hintVoteDown || 0), 0);
  const hintPct = totalCompletions > 0 ? Math.round((totalHintGames / totalCompletions) * 100) : 0;

  return (
    <>
      {/* Range controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: "#555" }}>Showing:</label>
        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 13, fontFamily: "serif", border: "1px solid #ccc", borderRadius: 4, background: "#fff" }}
        >
          {RANGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        {range === "month" && monthsAvailable.length > 0 && (
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 13, fontFamily: "serif", border: "1px solid #ccc", borderRadius: 4, background: "#fff" }}
          >
            {monthsAvailable.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{days.length} day{days.length === 1 ? "" : "s"} shown</div>
      </div>

      {/* Roll-up totals for the selected range */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
        <div className="admin-card" style={{ flex: 1, minWidth: 130, border: "1px solid #eee", borderRadius: 6, padding: "12px 14px", background: "#fafafa" }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "#777", textTransform: "uppercase" }}>Page visits</div>
          <div className="admin-card-big" style={{ fontSize: 22, fontWeight: "bold", color: "#121212", marginTop: 4 }}>{totalVisits.toLocaleString()}</div>
        </div>
        <div className="admin-card" style={{ flex: 1, minWidth: 130, border: "1px solid #eee", borderRadius: 6, padding: "12px 14px", background: "#fafafa" }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "#777", textTransform: "uppercase" }}>Completions</div>
          <div className="admin-card-big" style={{ fontSize: 22, fontWeight: "bold", color: "#121212", marginTop: 4 }}>{totalCompletions.toLocaleString()}</div>
        </div>
        <div className="admin-card" style={{ flex: 1, minWidth: 130, border: "1px solid #eee", borderRadius: 6, padding: "12px 14px", background: "#fafafa" }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "#777", textTransform: "uppercase" }}>Shares</div>
          <div className="admin-card-big" style={{ fontSize: 22, fontWeight: "bold", color: "#121212", marginTop: 4 }}>{totalShares.toLocaleString()}</div>
        </div>
        <div className="admin-card" style={{ flex: 1, minWidth: 130, border: "1px solid #eee", borderRadius: 6, padding: "12px 14px", background: "#fafafa" }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "#777", textTransform: "uppercase" }}>Hints used</div>
          <div className="admin-card-big" style={{ fontSize: 22, fontWeight: "bold", color: "#121212", marginTop: 4 }}>{totalHintUses.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 4, lineHeight: 1.5 }}>
            {totalHintGames.toLocaleString()} game{totalHintGames === 1 ? "" : "s"} · {hintPct}% of players
            {(totalHintUp + totalHintDown) > 0 && <><br />helpful? 👍 {totalHintUp} · 👎 {totalHintDown}</>}
          </div>
        </div>
      </div>

      {chartDays.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <h3 className="admin-h3" style={{ marginBottom: 12 }}>Daily Completions</h3>
          <DailyChart chartDays={chartDays} values={playerCounts} max={maxPlayers} />
        </div>
      )}

      {anyShares && (
        <div style={{ marginBottom: 30 }}>
          <h3 className="admin-h3" style={{ marginBottom: 12 }}>Daily Shares <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>· text + image combined</span></h3>
          <DailyChart chartDays={chartDays} values={shareCounts} max={maxShares} color="#1a7c3a" />
        </div>
      )}

      {anyScores && (
        <div style={{ marginBottom: 30 }}>
          <h3 className="admin-h3" style={{ marginBottom: 12 }}>Average Score per Day <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>· out of 500 · higher = easier edition</span></h3>
          <DailyChart chartDays={chartDays} values={avgScores} max={500} color="#2563a8" />
        </div>
      )}

      {topCountries.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <h3 className="admin-h3" style={{ marginBottom: 4 }}>Players by Country over time</h3>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>Top {topCountries.length} countries · daily completions · each chart scaled to its own range</div>
          {topCountries.map(cc => {
            const series = chartDays.map(d => (stats[d].countries || {})[cc] || 0);
            const tot = series.reduce((a, b) => a + b, 0);
            const mx = Math.max(...series, 1);
            return (
              <div key={cc} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: "bold", color: "#121212" }}>{countryFlag(cc)}</span>
                  <span style={{ color: "#666", fontSize: 12 }}>{tot.toLocaleString()} in range</span>
                </div>
                <DailyChart chartDays={chartDays} values={series} max={mx} color="#7c3aed" height={64} showValues={false} />
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(countriesAllTime).length > 0 && (
        <div style={{ borderTop: "1px solid #eee", padding: "16px 0", marginBottom: 8 }}>
          <div style={{ fontWeight: "bold", fontSize: 18 }}>All-time players by country</div>
          <CountryList counts={countriesAllTime} />
        </div>
      )}

      {days.length === 0 && <p>No data in this range.</p>}
      {days.map(date => {
        const d = stats[date];
        const avg = d.completions > 0 ? Math.round(d.totalScore / d.completions) : 0;
        const img = d.imageShares || 0;
        const txt = d.textShares || 0;
        const sharesTotal = img + txt;
        const shareRate = d.completions > 0 ? Math.round((sharesTotal / d.completions) * 100) : 0;
        const visitToCompletion = d.visits > 0 ? Math.round((d.completions / d.visits) * 100) : null;
        return (
          <div key={date} style={{ borderTop: "1px solid #eee", padding: "16px 0" }}>
            <div className="admin-day-title" style={{ fontWeight: "bold", fontSize: 18 }}>{date}</div>
            {(d.visits || 0) > 0 && (
              <div>
                Page visits: <b>{d.visits}</b>
                {visitToCompletion != null && <span style={{ color: "#666" }}> · {visitToCompletion}% played</span>}
              </div>
            )}
            <div>Completions: <b>{d.completions}</b></div>
            <div>Avg score: <b>{avg} / 5,000</b></div>
            <div>
              Shares: <b>{img}</b> image · <b>{txt}</b> text
              {d.completions > 0 && sharesTotal > 0 && <span style={{ color: "#666" }}> ({shareRate}% share rate)</span>}
            </div>
            <div>Scores: {d.scores.join(", ")}</div>
            <CountryList counts={d.countries} />
          </div>
        );
      })}
    </>
  );
}

function FeedbackTab({ feedback, obscure }) {
  if (feedback === null) return <p style={{ color: "#666" }}>Loading…</p>;
  return (
    <>
      {/* "Too obscure?" thumbs-down, aggregated per headline (most-flagged first). */}
      {Array.isArray(obscure) && obscure.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 className="admin-h3" style={{ marginBottom: 4 }}>👎 Flagged "too obscure" <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>· most-flagged first · {obscure.length} headlines</span></h3>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>These are auto-fed to the generator as "avoid this kind" examples.</div>
          {obscure.slice(0, 40).map((o, i) => (
            <div key={i} style={{ borderBottom: "1px solid #f0f0f0", padding: "9px 0", display: "flex", gap: 12, alignItems: "baseline" }}>
              <div style={{ fontWeight: "bold", fontSize: 15, color: "#b91c1c", minWidth: 28 }}>{o.players}×</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "#222", lineHeight: 1.3 }}>{o.text}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{o.category || "—"} · {o.publication || "—"} · <b>{o.year ?? "?"}</b></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="admin-h3" style={{ marginBottom: 12 }}>Feedback <span style={{ fontSize: 12, color: "#666", fontWeight: "normal" }}>· newest first · {feedback.length} total</span></h3>
      {feedback.length === 0 && <p style={{ color: "#666" }}>No written feedback yet.</p>}
      {feedback.map((f, i) => (
        <div key={i} style={{ borderBottom: "1px solid #eee", padding: "14px 0" }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
            {f.date} · {new Date(f.ts).toLocaleString()}
            {typeof f.score === "number" && <span> · scored <b>{f.score}</b> / 5,000</span>}
            {f.country && <span> · {flagEmoji(f.country)} {countryName(f.country)}</span>}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.message}</div>
          {f.email && (
            <div style={{ fontSize: 12.5, marginTop: 6 }}>
              ✉ <a href={`mailto:${f.email}?subject=Re: your Headlines feedback`} style={{ color: "#1a7c3a" }}>{f.email}</a>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function HeadlinesTab({ days, loading }) {
  const today = todayISO();
  const [sub, setSub] = useState("today");

  if (loading) return <p>Loading headlines…</p>;
  if (!days || days.length === 0) return <p>No headlines cached yet.</p>;

  // Split into three buckets: upcoming (future), today, past (reverse chrono)
  const upcoming = days.filter(d => d.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const todayDay = days.find(d => d.date === today);
  const past = days.filter(d => d.date < today).sort((a, b) => b.date.localeCompare(a.date));

  const buckets = {
    today: { items: todayDay ? [todayDay] : [], tag: "TODAY", tagColor: "#1a7c3a", empty: "No edition cached for today yet." },
    upcoming: { items: upcoming, tag: "UPCOMING", tagColor: "#b8860b", empty: "No upcoming days generated yet." },
    past: { items: past, tag: "PAST", tagColor: "#888", empty: "No past editions cached." },
  };

  const subTabStyle = (active) => ({
    padding: "7px 16px", background: active ? "#121212" : "#f2f2f2", color: active ? "#fff" : "#555",
    border: "none", cursor: "pointer", fontSize: 13, fontFamily: "serif", borderRadius: 4,
    marginRight: 6, whiteSpace: "nowrap",
  });

  const active = buckets[sub];

  return (
    <>
      {upcoming.length > 0 && (
        <div className="admin-headlines-notice" style={{ background: "#f8f8f2", border: "1px solid #d4d4a8", padding: "12px 14px", borderRadius: 4, marginBottom: 20, fontSize: 13, color: "#6b6a2b" }}>
          📅 <b>{upcoming.length}</b> upcoming {upcoming.length === 1 ? "day" : "days"} already generated. Review before they go live — if any look like a repeat, flag it (no regenerate UI yet; for now delete the <code>headlines:YYYY-MM-DD</code> Redis key and the next cron tick will regenerate).
        </div>
      )}

      <div style={{ display: "flex", marginBottom: 18 }}>
        <button style={subTabStyle(sub === "today")} onClick={() => setSub("today")}>Today{todayDay ? "" : " (0)"}</button>
        <button style={subTabStyle(sub === "upcoming")} onClick={() => setSub("upcoming")}>Upcoming ({upcoming.length})</button>
        <button style={subTabStyle(sub === "past")} onClick={() => setSub("past")}>Past ({past.length})</button>
      </div>

      {active.items.length === 0
        ? <p style={{ color: "#888", fontSize: 14 }}>{active.empty}</p>
        : active.items.map(d => <DayBlock key={d.date} day={d} tag={active.tag} tagColor={active.tagColor} />)}
    </>
  );
}

function DayBlock({ day, tag, tagColor }) {
  return (
    <div style={{ borderTop: "1px solid #eee", padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div className="admin-day-title" style={{ fontWeight: "bold", fontSize: 18 }}>{formatAdminDate(day.date)}</div>
        <span style={{ fontSize: 11, color: "#999", fontFamily: "monospace" }}>{day.date}</span>
        <span style={{ fontSize: 10, letterSpacing: ".1em", background: tagColor, color: "#fff", padding: "2px 8px", borderRadius: 2 }}>{tag}</span>
      </div>
      {day.headlines.map((h, i) => (
        <div key={i} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : "1px dotted #eee" }}>
          <div className="admin-headline-meta" style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
            {h.category || "—"} · {h.publication || "—"} · <b>{h.year}</b>
          </div>
          <div className="admin-headline-text" style={{ fontSize: 14, lineHeight: 1.35, color: "#222" }}>{h.text}</div>
          {h.context && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontStyle: "italic" }}>{h.context}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function countryFlag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "—";
  const flag = String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
  return `${flag} ${code}`;
}

function MembersTab({ users }) {
  if (users === null) return <div style={{ fontFamily: "serif", padding: 20 }}>Loading…</div>;
  if (users.length === 0) return <div style={{ fontFamily: "serif", padding: 20, color: "#666" }}>No members yet — registered emails will appear here.</div>;
  const fmt = (ts) => ts ? new Date(ts).toISOString().slice(0, 10) : "—";
  const emails = users.map(u => u.email).join(", ");
  return (
    <div style={{ fontFamily: "serif", padding: "8px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 18 }}>{users.length} registered email{users.length === 1 ? "" : "s"}</strong>
        <button onClick={() => { navigator.clipboard?.writeText(emails); }} style={{ fontSize: 12, padding: "6px 12px", cursor: "pointer", border: "1px solid #ccc", borderRadius: 6, background: "#fff" }}>
          Copy all emails
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #121212" }}>
            <th style={{ padding: "8px 6px" }}>Email</th>
            <th style={{ padding: "8px 6px" }}>Country</th>
            <th style={{ padding: "8px 6px" }}>Joined</th>
            <th style={{ padding: "8px 6px" }}>Days played</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 6px" }}>{u.email}</td>
              <td style={{ padding: "8px 6px", color: "#666" }}>{countryFlag(u.country)}</td>
              <td style={{ padding: "8px 6px", color: "#666" }}>{fmt(u.createdAt)}</td>
              <td style={{ padding: "8px 6px", color: "#666" }}>{u.daysPlayed ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Difficulty (#3) ───────────────────────────────────────────────────────────
// % of recorded guesses within `band` years of the true year. null if no data.
function pctWithin(dist, total, trueYear, band) {
  if (!dist || !total || trueYear == null) return null;
  let c = 0;
  for (const yr in dist) if (Math.abs(Number(yr) - trueYear) <= band) c += dist[yr];
  return Math.round((c / total) * 100);
}

function DifficultyTab({ stats }) {
  const dates = Object.keys(stats || {})
    .filter((d) => (stats[d]?.completions || 0) > 0)
    .sort((a, b) => b.localeCompare(a));
  const [date, setDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!date && dates.length) setDate(dates[0]); }, [dates.length]);
  useEffect(() => {
    if (!date) return;
    setLoading(true); setData(null);
    fetch(`/api/admin?action=difficulty&date=${date}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ headlines: [] }))
      .finally(() => setLoading(false));
  }, [date]);

  if (dates.length === 0) return <p style={{ color: "#666" }}>No completed games yet.</p>;

  // Score histogram (display scale 0–500, ten bins of 50).
  const dispScores = (stats[date]?.scores || []).map((s) => Math.round(s / 10));
  const BINS = 10, BIN = 50;
  const hist = Array.from({ length: BINS }, () => 0);
  dispScores.forEach((s) => { hist[Math.min(BINS - 1, Math.max(0, Math.floor(s / BIN)))]++; });
  const histMax = Math.max(1, ...hist);
  const avgDisp = dispScores.length ? Math.round(dispScores.reduce((a, b) => a + b, 0) / dispScores.length) : 0;
  const medianDisp = dispScores.length ? [...dispScores].sort((a, b) => a - b)[Math.floor(dispScores.length / 2)] : 0;

  return (
    <div style={{ fontFamily: "serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#666" }}>Edition:</span>
        <select value={date} onChange={(e) => setDate(e.target.value)} style={{ fontFamily: "serif", fontSize: 14, padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6 }}>
          {dates.map((d) => <option key={d} value={d}>{formatAdminDate(d)} ({stats[d]?.completions || 0})</option>)}
        </select>
      </div>

      <h3 className="admin-h3" style={{ fontSize: 15, marginBottom: 4 }}>Score distribution</h3>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>{dispScores.length} completions · avg {avgDisp} · median {medianDisp} (out of 500)</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, marginBottom: 6 }}>
        {hist.map((n, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>{n || ""}</div>
            <div style={{ width: "100%", height: `${(n / histMax) * 100}%`, background: "#121212", borderRadius: "2px 2px 0 0", minHeight: n ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 30 }}>
        {hist.map((_, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#999" }}>{i * BIN}</div>)}
      </div>

      <h3 className="admin-h3" style={{ fontSize: 15, marginBottom: 4 }}>Per-headline guess spread</h3>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Green bar = the decade of the true year. A flat spread with a low ±10y % = recognition-locked (players scatter).</div>
      {loading && <p style={{ color: "#888", fontSize: 13 }}>Loading…</p>}
      {data && Array.isArray(data.headlines) && data.headlines.map((h) => <HeadlineSpread key={h.idx} h={h} />)}
      {data && (!data.headlines || data.headlines.length === 0) && !loading && (
        <p style={{ color: "#888", fontSize: 13 }}>No guess data captured for this edition yet (capture started 23 Jun 2026 — older editions have none).</p>
      )}
    </div>
  );
}

function HeadlineSpread({ h }) {
  const total = h.total || 0;
  const exact = pctWithin(h.dist, total, h.year, 0);
  const w5 = pctWithin(h.dist, total, h.year, 5);
  const w10 = pctWithin(h.dist, total, h.year, 10);
  const decades = [];
  for (let d = 1900; d <= 2020; d += 10) decades.push(d);
  const buckets = decades.map(() => 0);
  let modeYear = null, modeCount = -1;
  for (const yr in h.dist) {
    const y = Number(yr), c = h.dist[yr];
    buckets[Math.min(decades.length - 1, Math.max(0, Math.floor((y - 1900) / 10)))] += c;
    if (c > modeCount) { modeCount = c; modeYear = y; }
  }
  const bMax = Math.max(1, ...buckets);
  const trueBi = h.year != null ? Math.min(decades.length - 1, Math.max(0, Math.floor((h.year - 1900) / 10))) : -1;
  const enough = total >= 10;
  let verdict = null;
  if (enough) {
    if (w10 != null && w10 < 40) verdict = { label: "🔒 Scattered — possible recognition-lock", color: "#b91c1c" };
    else if (exact != null && exact >= 45) verdict = { label: "✓ Well anchored", color: "#1a7c3a" };
    else verdict = { label: "Moderate", color: "#888" };
  }

  return (
    <div style={{ borderTop: "1px solid #eee", padding: "14px 0" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{h.category || "—"} · {h.publication || "—"} · true year <b>{h.year}</b> · {total} guesses</div>
      <div style={{ fontSize: 13.5, color: "#222", marginBottom: 8, lineHeight: 1.35 }}>{h.text}</div>
      {!enough ? (
        <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>Not enough guesses yet.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <span>Exact <b style={{ color: "#1a7c3a" }}>{exact}%</b></span>
            <span>±5y <b style={{ color: "#2563a8" }}>{w5}%</b></span>
            <span>±10y <b>{w10}%</b></span>
            <span style={{ color: "#888" }}>most common: {modeYear}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 54, marginBottom: 4 }}>
            {buckets.map((n, i) => (
              <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ width: "100%", height: `${(n / bMax) * 100}%`, background: i === trueBi ? "#1a7c3a" : "#bbb", borderRadius: "2px 2px 0 0", minHeight: n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
            {decades.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: i === trueBi ? "#1a7c3a" : "#bbb", fontWeight: i === trueBi ? 700 : 400 }}>{`'${String(d).slice(2)}`}</div>)}
          </div>
          {verdict && <div style={{ fontSize: 12, color: verdict.color, fontWeight: 600 }}>{verdict.label}</div>}
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [tab, setTab] = useState("players");
  const [stats, setStats] = useState(null);
  const [countriesAllTime, setCountriesAllTime] = useState({});
  const [usage, setUsage] = useState(null);
  const [headlineDays, setHeadlineDays] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [obscure, setObscure] = useState(null);
  const [spend, setSpend] = useState(null);
  const [users, setUsers] = useState(null);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin?action=stats")
      .then(r => r.json())
      .then(d => {
        setStats(d.stats || {});
        setCountriesAllTime(d.countriesAllTime || {});
        setUsage(d.usage || null);
      });
    fetch("/api/admin?action=headlines")
      .then(r => r.json())
      .then(d => setHeadlineDays(d.days || []));
    fetch("/api/feedback")
      .then(r => r.json())
      .then(d => setFeedback(d.items || []))
      .catch(() => setFeedback([]));
    fetch("/api/admin?action=obscure")
      .then(r => r.json())
      .then(d => setObscure(d.items || []))
      .catch(() => setObscure([]));
    fetch("/api/admin?action=spend")
      .then(r => r.json())
      .then(setSpend)
      .catch(() => setSpend({ configured: true, error: 'Network error' }));
    fetch("/api/admin?action=users")
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, [authed]);

  if (!authed) return (
    <div style={{ fontFamily: "serif", maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
      <h2>Admin</h2>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input type={showPw ? "text" : "password"} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && input === PASSWORD) setAuthed(true); }}
          placeholder="Password" style={{ padding: 10, paddingRight: 64, fontSize: 16, width: "100%", boxSizing: "border-box" }} />
        <button type="button" onClick={() => setShowPw(v => !v)}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#666" }}>
          {showPw ? "Hide" : "Show"}
        </button>
      </div>
      <button onClick={() => { if (input === PASSWORD) setAuthed(true); }}
        style={{ padding: "10px 30px", background: "#121212", color: "#fff", border: "none", cursor: "pointer", fontSize: 16 }}>
        Enter
      </button>
    </div>
  );

  const tabStyle = (active) => ({
    padding: "10px 22px",
    background: active ? "#121212" : "#f2f2f2",
    color: active ? "#fff" : "#555",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "serif",
    borderRadius: "4px 4px 0 0",
    marginRight: 4,
    whiteSpace: "nowrap",
    flexShrink: 0,
  });

  return (
    <>
      <style>{`
        /* Mobile responsiveness — overrides desktop defaults at narrow widths.
           Targets touchable padding, scrollable tab row, tighter outer
           padding, and smaller headings so the admin works on a phone. */
        .admin-root { font-family: serif; max-width: 720px; margin: 40px auto; padding: 0 20px; }
        .admin-tabs { display: flex; border-bottom: 2px solid #121212; margin-bottom: 24px;
                      overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .admin-tabs::-webkit-scrollbar { display: none; }
        .admin-h1 { font-size: 28px; margin: 0 0 18px; }
        @media (max-width: 640px) {
          .admin-root { margin: 16px auto; padding: 0 12px; }
          .admin-h1 { font-size: 20px; margin-bottom: 12px; }
          .admin-tabs button { padding: 8px 14px !important; font-size: 13px !important; }
          .admin-card { padding: 14px !important; }
          .admin-card-big { font-size: 24px !important; }
          .admin-headlines-notice { font-size: 12px !important; padding: 10px 12px !important; }
          .admin-headlines-notice code { font-size: 11px !important; word-break: break-all; }
          .admin-day-title { font-size: 16px !important; }
          .admin-h3 { font-size: 15px !important; }
          .admin-headline-text { font-size: 13px !important; line-height: 1.4 !important; }
          .admin-headline-meta { font-size: 11px !important; }
        }
      `}</style>
      <div className="admin-root">
        <h1 className="admin-h1">HEADLINES Admin</h1>

        <BudgetCard usage={usage} spend={spend} />

        <div className="admin-tabs">
          <button style={tabStyle(tab === "players")} onClick={() => setTab("players")}>Analytics</button>
          <button style={tabStyle(tab === "headlines")} onClick={() => setTab("headlines")}>
            Headlines{headlineDays ? ` (${headlineDays.length})` : ""}
          </button>
          <button style={tabStyle(tab === "difficulty")} onClick={() => setTab("difficulty")}>Difficulty</button>
          <button style={tabStyle(tab === "feedback")} onClick={() => setTab("feedback")}>
            Feedback{feedback ? ` (${feedback.length})` : ""}
          </button>
          <button style={tabStyle(tab === "members")} onClick={() => setTab("members")}>
            Members{users ? ` (${users.length})` : ""}
          </button>
        </div>

        {tab === "players" && <AnalyticsTab stats={stats || {}} countriesAllTime={countriesAllTime} />}
        {tab === "headlines" && <HeadlinesTab days={headlineDays} loading={headlineDays === null} />}
        {tab === "difficulty" && <DifficultyTab stats={stats || {}} days={headlineDays} />}
        {tab === "feedback" && <FeedbackTab feedback={feedback} obscure={obscure} />}
        {tab === "members" && <MembersTab users={users} />}
      </div>
    </>
  );
}
