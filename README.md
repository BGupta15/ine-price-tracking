# Product Price Tracker

A small full-stack app that tracks product prices on INE's mock store. You search for a product, start tracking it, and the app checks its price and stock every 2 hours. Each tracked product gets a price chart, a history table, and a scrape log that lists every attempt, including the ones that failed.

- **Live site:** ine-price-tracking.vercel.app
- **Backend API:** https://ine-price-tracking.onrender.com
- **Scraped site:** https://demo.inelabteamdev.com (the only site this app touches)

## What it does

- Search the store's catalog by full or partial product name.
- Track a product. It is saved to the database and scraped right away, so you don't wait for the next scheduled run.
- Check every tracked product for its current price and stock every 2 hours.
- See a price chart, a history table (price, in stock, stock quantity) and a scrape log for each product.
- Every scrape attempt is logged as `success`, `retried` or `failed`, with the number of attempts and a short detail message.

## Tech stack

| Layer | Technology | Hosted on |
|---|---|---|
| Frontend | React (Vite) | Vercel |
| Backend | Node.js and Express | Render (Docker) |
| Database | PostgreSQL | Supabase |
| Scraper | Playwright (Chromium) | Runs inside the backend |
| Scheduler | cron-job.org | External, free |

## How it works

1. When you click Track, the backend saves the product in Supabase and puts a first scrape in a queue. The request returns immediately and the scrape runs in the background.
2. cron-job.org calls `POST /api/scrape/run` every 2 hours. The endpoint answers with `202` straight away and scrapes each tracked product in the background, one at a time.
3. Every attempt is written to `scrape_log`. Only a successful scrape that produced a price is written to `price_history`, so a failure never leaves a wrong or empty data point in the history.
4. The dashboard reads both tables and shows the latest price, the chart, the history and the log.

### Why a browser instead of plain HTTP

The store hides the price behind a "Reveal price" button. That button stays disabled until a real pointer has been over the price panel for about a second, and the price itself comes back encrypted and is decrypted by the page's own JavaScript. Plain HTTP requests can't do either of those things, so the scraper drives Chromium the way a visitor would and reads the price from the rendered page. The product catalog used for search is read over plain HTTP.

### What keeps the scraper reliable

- Up to 5 attempts per product. The outcome is `success` if the first attempt worked, `retried` if a later attempt worked, and `failed` if none did.
- It closes the cookie popup whenever it shows up, including when it comes back later.
- It keeps the mouse moving inside the price panel until the button becomes enabled, then clicks.
- It waits for either the "Refresh price" button (success) or the "Couldn't load the price" message (failure), with a timeout, rather than sleeping for a fixed time.
- After a timeout, or after the button fails to enable twice, it reloads the page and tries again.
- It reads only the product header and price panel. If no price can be read, the attempt counts as failed.
- If stock can't be determined, it is stored as unknown and shown as "Stock unknown". It is never guessed.

The design note (`DESIGN_NOTE.md`) explains these choices and the trade-offs in more detail.

## Scraping schedule

| What | How often |
|---|---|
| Scrape all tracked products (`POST /api/scrape/run`, called by cron-job.org) | Every 2 hours |
| Keep-warm ping (`GET /health`, called by cron-job.org) | Every 10 minutes |
| First scrape of a newly tracked product | Immediately |

Free-tier hosting goes to sleep when idle, so nothing inside the server runs on a timer. An outside cron service wakes it up instead. The scrape endpoint replies before the work is done because cron-job.org stops waiting after roughly 30 seconds, and a full run takes longer than that.

## Environment variables

### Backend (`backend/.env` locally, Render's Environment tab when deployed)

| Variable | What it is for |
|---|---|
| `PORT` | Port to listen on. Render sets this itself. Use `4000` locally |
| `STORE_BASE_URL` | `https://demo.inelabteamdev.com` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Server only, never expose it to the frontend |
| `SCRAPE_TRIGGER_SECRET` | Shared secret that cron-job.org sends to `/api/scrape/run` |
| `FRONTEND_ORIGIN` | The frontend URL allowed by CORS, for example `https://YOUR-APP.vercel.app`. Separate several with commas |
| `SCRAPER_MODE` | `new-headless` for servers (no display needed). `headed` or unset shows a real browser window |

### Frontend (`frontend/.env` locally, Vercel's environment variables when deployed)

| Variable | What it is for |
|---|---|
| `VITE_API_BASE_URL` | The backend URL with no trailing slash, for example `https://YOUR-BACKEND.onrender.com` |

## Running locally

You need Node 18 or newer.

```bash
# 1. Database: run the SQL from "Database schema" below in Supabase's SQL Editor.

# 2. Backend
cd backend
cp .env.example .env        # then fill in the values
npm install
npx playwright install chromium
npm run dev                 # runs on http://localhost:4000

# 3. Frontend (in a second terminal)
cd frontend
cp .env.example .env        # set VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev
```

To scrape every tracked product right now:

```bash
curl -X POST "http://localhost:4000/api/scrape/run?secret=YOUR_SECRET&wait=true"
```

With `wait=true` the request stays open and returns the results. Without it the endpoint replies `202` and works in the background, which is how cron uses it.

## Watching the scraper run (headed mode)

From the `backend` folder:

```bash
# Real browser window, slowed down so you can follow along
npm run scrape:headed -- 905
# same thing without the npm script: SLOW_MO=250 node src/scraper/runOnce.js 905

# Force slow or failing behaviour: a 1500 ms per-attempt timeout triggers retries and reloads
node src/scraper/runOnce.js 905 1500

# Headless, using Chromium's new headless mode
npm run scrape:headless -- 905
```

`905` is a product ID, the number in the store URL `/product/905`. The script prints each attempt as it happens, then the final result as JSON.

## Deploying

Do these in order. The cron jobs come last because they call the backend's public URL.

1. **Supabase.** Create a project and run the SQL below in the SQL Editor. Then open Project Settings, then API, and copy the Project URL and the service role key.
2. **GitHub.** Push the repo as a public repository. Check that no `.env` file is committed.
3. **Render (backend).** Create a new Web Service from the repo.
   - Leave Root Directory blank. The `Dockerfile` is at the repo root and copies from `backend/`.
   - Runtime: Docker. Instance type: Free. Health Check Path: `/health`.
   - Add the backend environment variables from the table above, except `FRONTEND_ORIGIN`.
   - When it shows Live, open `https://YOUR-BACKEND.onrender.com/health`. You should see `{"ok":true}`.
4. **Vercel (frontend).** Import the repo, set Root Directory to `frontend` and keep the Vite preset. Add `VITE_API_BASE_URL` with your Render URL and deploy. Vite bakes this value in at build time, so redeploy if you change it.
5. **Render again.** Set `FRONTEND_ORIGIN` to your Vercel URL and let it redeploy. Without this the browser blocks the frontend's API calls.
6. **cron-job.org.** Create two jobs:
   - `POST hhttps://ine-price-tracking.onrender.com/api/scrape/run?secret=YOUR_SECRET` every 2 hours.
   - `GET https://ine-price-tracking.onrender.com/health` every 10 minutes.
   - The secret in the first URL must match `SCRAPE_TRIGGER_SECRET` on Render exactly, or every call returns 401. Use the Test run button and expect a `202`.
7. **Check it.** Open the live site, search for a product and track it. It should change from "Scraping now..." to a price, and the history and scrape log should fill in.

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/search?q=` | Search the store catalog by name |
| POST | `/api/tracked` | Track a product and start its first scrape |
| GET | `/api/tracked` | Tracked products with their latest price and latest scrape attempt |
| GET | `/api/tracked/:id/history` | Price and stock history |
| GET | `/api/tracked/:id/log` | Scrape attempts and outcomes |
| POST | `/api/scrape/run?secret=` | Scrape all tracked products (called by cron) |

## Database schema

```sql
create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  product_id integer not null unique,
  name text,
  sku text,
  category text,
  brand text,
  tracked_at timestamptz not null default now()
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  price numeric,
  details jsonb,
  currency text default 'INR',
  in_stock boolean,
  stock_qty integer,
  scraped_at timestamptz not null default now()
);

create table if not exists scrape_log (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  attempts integer not null default 1,
  detail text
);

create index if not exists idx_price_history_product_time
  on price_history (tracked_product_id, scraped_at desc);

create index if not exists idx_scrape_log_product_time
  on scrape_log (tracked_product_id, attempted_at desc);
```

## Project structure

```
Dockerfile                  builds the backend image for Render
backend/
  src/
    index.js                Express app, CORS, /health, route setup
    lib/supabaseClient.js
    routes/                 search, tracked, history and log, scrape (cron endpoint)
    scraper/
      revealPrice.js        the Playwright scraper
      scrapeProduct.js      scrapes one product, writes to the database, holds the queue
      runOnce.js            command line tool for headed and headless test runs
frontend/
  src/App.jsx, api.js       search, tracked list, chart, history table, scrape log
```