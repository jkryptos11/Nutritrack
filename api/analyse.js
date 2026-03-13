// Vercel serverless function — proxies requests to Anthropic API
// This runs on Vercel's server, so CORS is not an issue
export default async function handler(req, res) {
  // Allow requests from our app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { text } = req.body;
  if (!text) { res.status(400).json({ error: 'No text provided' }); return; }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `You are a nutrition analyst specialising in Indian food. Return ONLY a valid JSON array, no markdown, no explanation. Treat the entire input as one combined dish unless clearly separate items. Each object must have: {"name":string,"kcal":number,"protein":number,"carbs":number,"fat":number}. Use integers only. Assume standard Indian home serving sizes.`,
        messages: [{ role: 'user', content: text }],
      }),
    });

    const data = await response.json();
    if (data.error) { res.status(500).json({ error: data.error.message }); return; }
    const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    res.status(200).json({ items: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
