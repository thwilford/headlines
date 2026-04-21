import { useEffect, useState } from "react";

const PASSWORD = "headlines2026";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/admin-stats")
      .then(r => r.json())
      .then(d => setStats(d.stats || {}));
  }, [authed]);

  if (!authed) return (
    <div style={{ fontFamily: "serif", maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
      <h2>Admin</h2>
      <input type="password" value={input} onChange={e => setInput(e.target.value)}
        placeholder="Password" style={{ padding: 10, fontSize: 16, width: "100%", marginBottom: 10 }} />
      <button onClick={() => { if (input === PASSWORD) setAuthed(true); }}
        style={{ padding: "10px 30px", background: "#121212", color: "#fff", border: "none", cursor: "pointer", fontSize: 16 }}>
        Enter
      </button>
    </div>
  );

  const days = Object.keys(stats || {}).sort().reverse();
  const chartDays = [...days].reverse();
  const maxPlayers = Math.max(...chartDays.map(d => stats[d].completions), 1);

  return (
    <div style={{ fontFamily: "serif", maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontFamily: "serif" }}>HEADLINES Admin</h1>

      {chartDays.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <h3 style={{ marginBottom: 12 }}>Daily Players</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
            {chartDays.map(date => {
              const count = stats[date].completions;
              const pct = (count / maxPlayers) * 100;
              return (
                <div key={date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{count}</div>
                  <div style={{ width: "100%", maxWidth: 40, background: "#121212", borderRadius: "3px 3px 0 0", height: `${Math.max(pct, 2)}%` }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {chartDays.map(date => (
              <div key={date} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#999", marginTop: 4 }}>
                {date.slice(5)}
              </div>
            ))}
          </div>
        </div>
      )}

      {days.length === 0 && <p>No data yet.</p>}
      {days.map(date => {
        const d = stats[date];
        const avg = d.completions > 0 ? Math.round(d.totalScore / d.completions) : 0;
        return (
          <div key={date} style={{ borderTop: "1px solid #eee", padding: "16px 0" }}>
            <div style={{ fontWeight: "bold", fontSize: 18 }}>{date}</div>
            <div>Completions: <b>{d.completions}</b></div>
            <div>Avg score: <b>{avg} / 5,000</b></div>
            <div>Scores: {d.scores.join(", ")}</div>
          </div>
        );
      })}
    </div>
  );
}
