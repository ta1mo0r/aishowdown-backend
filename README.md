# AI Showdown — Backend Proxy

A thin proxy that holds your **real Anthropic API key server-side** and forwards
requests from the Android app to `https://api.anthropic.com/v1/messages`. This exists
because the app can never safely ship an API key inside the APK — anyone can unzip an
APK and read any string baked into it, including "hidden" JS.

Two identical implementations, pick whichever fits how you want to host it:
- `api/claude.js` — a Vercel serverless function (`api/*.js` files auto-deploy as
  routes on Vercel, zero config needed).
- `server.js` — a plain Express server for any other host (Render, Railway, Fly.io,
  a VPS, etc.), reusing the same handler.

## Deploy on Vercel (fastest path)
1. Push this folder to its own GitHub repo (or `vercel --prod` directly from here with
   the [Vercel CLI](https://vercel.com/docs/cli)).
2. Import the repo in the [Vercel dashboard](https://vercel.com/new).
3. In the project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your real key from console.anthropic.com
4. Deploy. Your endpoint is `https://<your-project>.vercel.app/api/claude`.

## Deploy anywhere else (Express)
```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... node server.js
```
Put this behind whatever HTTPS reverse proxy / hosting platform you use. Your endpoint
is `https://<your-domain>/api/claude`.

## Wire it into the app
Open `aishowdown-app/www/index.html`, find the `AI_BACKEND_URL` constant near
`callClaude()`, and set it to your deployed URL, e.g.:
```js
const AI_BACKEND_URL = "https://your-app.vercel.app/api/claude";
```
Then re-run `npx cap sync android` in the app project so the change is copied into the
native build.

## What this proxy does
- Accepts `POST { system, userText, maxTokens, model }` from the app.
- Forwards it to Anthropic with your server-side key attached, capped to the models in
  `ALLOWED_MODELS` and a max of 1500 output tokens per call (edit `api/claude.js` if you
  need higher limits).
- Applies a basic per-IP rate limit (30 requests/minute) to blunt casual abuse if the
  URL ever leaks — this is in-memory and resets on redeploy/cold start, so treat it as a
  speed bump, not real protection. For a shipped app expecting real traffic, put a
  proper rate limiter (Upstash Redis, Vercel Edge Config, Cloudflare, etc.) in front of
  this, and consider adding a shared-secret header the app sends so randos who find the
  URL can't use it at all.
- Returns Anthropic's response JSON unchanged, which is what `callClaude()` in the app
  already expects.

## Costs
You're paying for Anthropic API usage per request (same pricing as any other API use —
see anthropic.com/pricing). There's no way around a live model call costing money per
request; that's true of any app with an LLM opponent, not specific to this setup.
