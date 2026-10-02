# 🧭 Opportunity Scout

Scans the **web**, **Reddit**, and **X (Twitter)** for **free and low-capital earning opportunities** — airdrops, bounties, remote gigs, grants, side hustles, and Nigeria-specific openings — and presents them in one clean, tagged dashboard.

**Stack:** Node.js · Express · vanilla JS (no API keys required)

## Features

- 📡 **Multi-source scanning**
  - Web search via DuckDuckGo (through the keyless `r.jina.ai` reader proxy), with a *past-week freshness filter* on hot queries
  - Reddit Atom feeds: r/beermoney, r/WorkOnline, r/slavelabour, r/forhire, r/sidehustle, r/airdrops
  - RemoteOK remote-jobs API
  - X posts found through `site:x.com` web search (free) — or **direct X API v2 search** if you paste your own bearer token in Settings
- 🏷️ **Auto-classification** per opportunity:
  - Capital: ⚡ Free / 💼 Low-capital
  - Topics: 🪙 Crypto, 💻 Jobs & gigs, 🏪 Business, 🎓 Grants, 🧩 Microtasks
  - Region: 🇳🇬 Nigeria-specific results get their own tab
- ⚠️ **Scam red-flag detection** — warns on "pay a fee first", "guaranteed returns", seed-phrase asks, WhatsApp/Telegram funnels, pressure tactics
- 🔍 **Custom search** bar runs your own query across web + Reddit + X
- 🔖 **Save opportunities** (persisted in your browser's localStorage)
- ⏱️ **10-minute server cache** per scan + last-good carry-over when a source is rate-limited

## Run it

```bash
npm install
npm start          # serves on http://localhost:3000
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/opportunities` | Full aggregated scan (cached 10 min) |
| `GET /api/search?q=…` | Custom search: web + Reddit + site:x.com |
| `GET /api/x-direct?q=…` | X API v2 recent search — needs header `x-x-bearer: <token>` |
| `GET /api/health` | Liveness check |

## Notes & limits

- The **first scan takes ~30 seconds** (polite rate limiting across sources: Jina ~20 req/min, Reddit ~1 feed/2s). After that, responses are cached for 10 minutes.
- X search via web is best-effort without an API key; a paid X API plan enables real-time direct search.
- Listings are **not endorsements**. Always DYOR — never pay to get paid, never share seed phrases or OTPs.
