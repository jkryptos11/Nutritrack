// Vercel serverless function - CommonJS format required
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { text } = req.body || {};
  if (!text) { res.status(400).json({ error: 'No text provided' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'API key not configured' }); return; }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: 'You are a nutrition analyst specialising in Indian food. Return ONLY a valid JSON array, no markdown, no explanation. Each object must have: {"name":string,"kcal":number,"protein":number,"carbs":number,"fat":number}. Use integers only. Assume standard Indian home serving sizes.',
    messages: [{ role: 'user', content: text }],
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const r = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    const parsed = JSON.parse(result.body);
    if (parsed.error) { res.status(500).json({ error: parsed.error.message }); return; }
    const raw = parsed.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    const items = JSON.parse(raw);
    res.status(200).json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
