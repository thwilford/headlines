export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const response = await fetch('https://www.headlines.games/api/generate-headlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usedTexts: [] }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: 'generate-headlines failed', status: response.status, body: text });
    }

    const data = await response.json();
    return res.status(200).json({ ok: true, count: data.headlines?.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
