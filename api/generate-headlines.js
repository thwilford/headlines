export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { usedTexts = [] } = req.body || {};

  const prompt = `You are a historian creating a daily newspaper history quiz game called HEADLINES.

Generate exactly 15 new historically significant headlines from real events across world history (1900–2025).

RULES:
- Cover diverse eras: pre-war, WW2, Cold War, modern era, recent decades
- Cover diverse regions: Americas, Europe, Asia, Africa, Middle East, Oceania
- NO political bias — focus on: science, disasters, sport, exploration, medicine, technology, economics, culture, wars beginning/ending
- Headlines must be factually accurate real events
- Write in the style of newspaper front pages — ALL CAPS, dramatic, concise
- Each must be genuinely surprising/interesting to guess the year of
- DO NOT repeat any of these already used headlines: ${usedTexts.slice(0, 20).join(' | ')}

Return ONLY a JSON array, no markdown, no preamble:
[
  {
    "id": "ai_${Date.now()}_1",
    "text": "HEADLINE TEXT HERE IN ALL CAPS",
    "year": 1965,
    "publication": "The New York Times",
    "pubColor": "#1a1a1a",
    "context": "2-3 sentence factual context shown after the player guesses."
  }
]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const headlines = JSON.parse(clean);

    res.status(200).json({ headlines });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: 'Failed to generate headlines' });
  }
}
