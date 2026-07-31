// Standalone Express version of the same proxy, for hosting anywhere that
// isn't Vercel (Render, Railway, Fly.io, your own VPS, etc.).
//
//   npm install express cors
//   ANTHROPIC_API_KEY=sk-ant-... node server.js
//
// The route is intentionally identical (POST /api/claude) to api/claude.js
// so the same client code works against either deployment.

const express = require('express');
const cors = require('cors');
const claudeHandler = require('./api/claude.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.post('/api/claude', (req, res) => claudeHandler(req, res));
app.options('/api/claude', (req, res) => claudeHandler(req, res));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI Showdown proxy listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY is not set — requests will fail with 500.');
  }
});
