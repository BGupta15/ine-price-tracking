# INE Price Tracker — Implementation Roadmap

Deadline: Sep 20, 11:59 PM IST. Priority order matches the rubric: scraping
reliability > correctness under difficulty > honest logging > judgment >
deployment. Bonus features are last — skip them unless everything above is
solid with time to spare.

## What we've confirmed about the store (recon)

- `GET /api/catalog?page=&pageSize=` → open JSON, no auth needed. This is our
  lightweight-fetch target for search.
- Product detail page hides price behind a "Reveal Price" button that appears
  ~2s after load.
- Clicking it triggers `GET /api/challenge` (returns a proof-of-work puzzle:
  salt, timestamp, difficulty, a WASM module) → `POST /api/session` (solves
  the puzzle + sends a browser fingerprint) → `GET /api/price` (returns the
  actual price/stock once session succeeds).
- The challenge is genuinely solvable (seen "Loaded in 1 attempt") but
  sometimes fails and needs a retry — real, observed flakiness, not a fixed
  wall.
- **Design decision:** because the challenge relies on canvas/WebGL
  fingerprinting (browser-only concepts), we let a real headless browser
  (Playwright) solve it exactly as a human's browser would, rather than
  reverse-engineering the WASM and faking a fingerprint. Catalog search stays
  a plain HTTP fetch since it needs none of this. This hybrid is our answer to
  the "sensible choice between lightweight fetching and a headless browser"
  evaluation point.

## Still to confirm before the scraper is final (send me these)

- [ ] The exact URL in the browser's address bar when viewing a product
      detail page (e.g. is it `/products/865`, `/product/865`, `/item/865`?)
- [ ] The full JSON body of one `GET /api/price` response (field names for
      price, discount, stock count, currency)
- [ ] Whether the storefront itself has a search box, and if so what request
      it fires when you type in it (tells us if `/api/catalog` supports a
      `search=` query param, or if we should fetch-and-filter ourselves)
- [ ] Confirm `npm run dev` + `/api/health` worked locally

## Phase 1 — Data layer ✅ done
- [x] `supabase/schema.sql` — `tracked_products`, `price_history`, `scrape_log`
- [x] Run it in Supabase SQL editor

## Phase 2 — Backend skeleton ✅ done
- [x] `backend/package.json`, `.env.example`, `src/index.js`, `src/lib/supabaseClient.js`

## Phase 3 — Search + track endpoints (delivered this step)
- [ ] `src/routes/search.js` — `GET /api/search?q=` against the catalog
- [ ] `src/routes/tracked.js` — `POST /api/tracked` (add), `GET /api/tracked` (list + latest price)
- [ ] `src/routes/history.js` — `GET /api/tracked/:id/history`, `GET /api/tracked/:id/log`
- [ ] Wire all three into `src/index.js`
- [ ] Test each with `curl` or Postman before moving on

## Phase 4 — The scraper (delivered this step, pending your two confirmations above)
- [ ] `src/scraper/revealPrice.js` — Playwright: navigate, click reveal, retry
      on failure up to a cap, intercept the `/api/price` response, return a
      structured result (never fabricate data on failure)
- [ ] `src/scraper/runOnce.js` — CLI entry point for manual/headed testing
- [ ] `src/routes/scrape.js` — `POST /api/scrape/run?secret=...`, loops over
      all tracked products, writes `scrape_log` every time, writes
      `price_history` only on success
- [ ] Test locally with `HEADLESS=false npm run scrape:headed <productId>` and
      **watch it actually happen** before trusting it

## Phase 5 — Frontend (React + Vite, next after backend is verified)
- [ ] Search box → results list → "Track" button
- [ ] Tracked products list, each showing latest price/stock
- [ ] Price/stock history (table or chart) per product
- [ ] Scrape log view per product (success/retried/failed, honestly)

## Phase 6 — Deploy
- [ ] Backend → Render (Web Service, connect GitHub repo, set env vars,
      remember `npx playwright install chromium` needs to run at build time
      via a build/postinstall script)
- [ ] Frontend → Vercel (connect repo, set the backend URL as an env var)
- [ ] Supabase already live — just confirm the deployed backend can reach it

## Phase 7 — Scheduling
- [ ] cron-job.org → new cron job, POST every 2 hours to
      `https://your-render-url/api/scrape/run?secret=...`
- [ ] Also set up a separate "keep-alive" ping (e.g. every 10 min to `/api/health`)
      if Render's sleep behavior causes the first real scrape after idle to
      time out — test this before assuming it's needed

## Phase 8 — Recording, docs, submission
- [ ] 2-4 min screen recording: headed scraper run, including one
      slow/failing attempt and its retry
- [ ] README: setup steps, scrape schedule, required env vars
- [ ] Design note: reliability approach, fetch-vs-browser trade-off, what an
      AI tool got wrong first try and how you fixed it (this needs to be
      genuinely true — keep notes as we hit snags)
- [ ] Push to public GitHub repo
- [ ] Email sstephen@ine.com, cc ssingh@ine.com — subject
      "First Round: Software Engineer Intern Assignment - Brinda"
