# Build context = repo root (leave Render's "Root Directory" blank).
# Playwright image version must match "playwright": "1.47.0" in package.json.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    SCRAPER_MODE=new-headless

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./

# new-headless: run the server directly (no display needed).
# anything else (e.g. SCRAPER_MODE=headed): run under Xvfb so headed Chromium works.
# The echo makes the chosen mode visible at the top of Render's runtime logs.
CMD ["sh", "-c", "echo \"Starting: mode=${SCRAPER_MODE:-headed} PORT=$PORT node=$(node -v)\"; if [ \"$SCRAPER_MODE\" = \"new-headless\" ]; then exec node src/index.js; else exec xvfb-run --auto-servernum --server-args='-screen 0 1280x800x24' node src/index.js; fi"]