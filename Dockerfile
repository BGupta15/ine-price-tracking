# Official Playwright image: matches package.json's pinned playwright version,
# comes with all browser OS dependencies AND xvfb preinstalled.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./

# Render sets $PORT itself; our app already reads process.env.PORT.
EXPOSE 4000

# xvfb-run gives Chromium a virtual display, so launching with
# headless:false (required — see revealPrice.js) works on a server with no
# physical screen, exactly as it does on a real desktop.
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x800x24", "node", "src/index.js"]