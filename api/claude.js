// Vercel serverless function: POST /api/claude
// Proxies requests to Anthropic's Messages API using a server-side API key,
// so the key never ships inside the Android app / APK.
//
// Deploy: put this whole `aishowdown-backend` folder in its own git repo,
// import it in Vercel, and set an ANTHROPIC_API_KEY environment variable
// in the Vercel project settings (Project → Settings → Environment Variables).

const ALLOWED_MODELS = new Set([
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);

// Simple in-memory rate limiter (per serverless instance — good enough to blunt
// casual abuse; for real production traffic put this behind a proper rate
// limiter / API gateway, e.g. Vercel's Edge Config or Upstash Redis).
const requestLog = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimited(ip) {
  const now = Date.now();
  const entry = requestLog.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  requestLog.set(ip, entry);
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  // CORS: lock this down to your app's origin(s) once you have one.
  // Native Android WebView requests typically send no Origin header at all,
  // so this mostly matters if you also test the game from a browser tab.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'server_missing_api_key' });
    return;
  }

  const { system, userText, maxTokens, model } = req.body || {};
  if (typeof userText !== 'string' || !userText.trim()) {
    res.status(400).json({ error: 'missing_userText' });
    return;
  }

  const chosenModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-5';
  const cappedTokens = Math.min(Math.max(Number(maxTokens) || 700, 1), 1500);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: cappedTokens,
        system: typeof system === 'string' ? system.slice(0, 4000) : undefined,
        messages: [{ role: 'user', content: String(userText).slice(0, 4000) }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'upstream_error', detail: data });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream_unreachable' });
  }
};
