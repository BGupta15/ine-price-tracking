import { chromium } from 'playwright';

const STORE = process.env.STORE_BASE_URL;
const productUrl = (productId) => `${STORE}/product/${productId}`;

export async function revealPrice(productId, { maxAttempts = 5, attemptTimeoutMs = 8000 } = {}) {
  const newHeadless = process.env.SCRAPER_MODE === 'new-headless';

  const browser = await chromium.launch({
    headless: false,
    slowMo: Number(process.env.SLOW_MO || 0),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(newHeadless ? ['--headless=new'] : []),
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const log = (msg) => console.log(`[${productId}] ${msg}`);

  const button = page.getByRole('button', { name: /reveal price|try again/i });

  // Backstop: Playwright runs this automatically before hover()/click() if the
  // cookie modal is in the way. (It does NOT fire for page.mouse.*, so the
  // hover loop below also checks manually.)
  await page.addLocatorHandler(page.getByRole('button', { name: 'Accept cookies' }), async (accept) => {
    await accept.click();
  });

  let attempts = 0;
  let lastDetail = 'no attempt completed';
  let armFailures = 0;

  try {
    await page.goto(productUrl(productId), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await dismissCookieBanner(page, 4000); // banner renders late, so wait for it once

    while (attempts < maxAttempts) {
      attempts++;
      log(`attempt ${attempts}: arming button...`);

      try {
        const armed = await armButton(page, button, attemptTimeoutMs);
        if (!armed) {
          lastDetail = 'Reveal button never became enabled (hover not registered or overlay blocking)';
          log(`attempt ${attempts}: ${lastDetail}`);
          armFailures++;
          if (armFailures >= 2) {
            log('reloading page to recover');
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
            await dismissCookieBanner(page, 3000);
            armFailures = 0;
          }
          continue;
        }
        armFailures = 0;
        await button.click({ timeout: 3000 });
      } catch (err) {
        lastDetail = `Interaction error: ${err.message.split('\n')[0]}`;
        log(`attempt ${attempts}: ${lastDetail}`);
        await page.waitForTimeout(500);
        continue;
      }

      const outcome = await raceOutcome(page, attemptTimeoutMs);
      log(`attempt ${attempts}: outcome = ${outcome}`);

      if (outcome === 'success') {
        await page.waitForTimeout(300); // let the DOM settle after decryption
        const details = await extractDetails(page);

        if (details.finalPrice == null) {
          // Refresh button showed up but no price parsed: never store this.
          lastDetail = 'Reveal succeeded but no price could be parsed from the page';
          log(`attempt ${attempts}: ${lastDetail}`);
          continue;
        }

        return {
          success: true,
          attempts,
          outcome: attempts === 1 ? 'success' : 'retried',
          detail: attempts === 1 ? 'Price loaded on first attempt' : `Price loaded after ${attempts} attempts (last issue: ${lastDetail})`,
          price: details.finalPrice,
          inStock: details.inStock,
          stockQty: details.stockQty,
          details,
        };
      }

      if (outcome === 'failure') {
        lastDetail = "Site reported \"Couldn't load the price\"";
      } else {
        lastDetail = `No response within ${attemptTimeoutMs}ms (slow load)`;
        // Page may be stuck; reload to recover before the next attempt.
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          await dismissCookieBanner(page, 3000);
        } catch {}
      }
      await page.waitForTimeout(500);
    }

    return {
      success: false,
      attempts,
      outcome: 'failed',
      detail: `Price never loaded after ${attempts} attempts. Last issue: ${lastDetail}`,
    };
  } catch (err) {
    return {
      success: false,
      attempts: attempts || 1,
      outcome: 'failed',
      detail: `Scraper error: ${err.message}`,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Cookie modal (div.cookie-overlay > role="dialog"), button aria-label="Accept cookies".
 * waitMs > 0: wait up to that long for it to appear (used once after page load).
 * waitMs = 0: instant check (used inside polling loops).
 */
async function dismissCookieBanner(page, waitMs = 0) {
  const accept = page.getByRole('button', { name: 'Accept cookies' });
  try {
    if (waitMs > 0) {
      await accept.waitFor({ state: 'visible', timeout: waitMs });
    } else if (!(await accept.isVisible())) {
      return;
    }
    await accept.click({ timeout: 2000 });
    console.log('  [cookie banner] accepted');
    await page.waitForTimeout(300);
  } catch {
    // no banner: fine
  }
}

/**
 * The button is enabled only after a real pointer has been over .price-block
 * for ~1s. Keep the mouse moving inside the panel (away from the button) and
 * poll until it's enabled. Returns true if enabled before the timeout.
 */
async function armButton(page, button, timeoutMs) {
  await button.waitFor({ state: 'visible', timeout: 10000 });
  const block = page.locator('.price-block');
  await block.scrollIntoViewIfNeeded();

  const deadline = Date.now() + timeoutMs;
  let i = 0;
  while (Date.now() < deadline) {
    await dismissCookieBanner(page); // it can pop up again mid-loop
    const box = await block.boundingBox(); // re-read each loop; layout can shift
    if (box) {
      const y = box.y + box.height * (i % 2 ? 0.35 : 0.65);
      await page.mouse.move(box.x + box.width * 0.15, y, { steps: 6 });
      await page.mouse.move(box.x + box.width * 0.45, y, { steps: 6 });
    }
    i++;
    if (await button.isEnabled()) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/** 'success' | 'failure' | 'timeout', whichever signal appears first. */
async function raceOutcome(page, timeoutMs) {
  const success = page
    .getByRole('button', { name: /refresh price/i })
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => 'success');
  // `.` instead of ' so both straight and curly apostrophes match
  const failure = page
    .getByText(/couldn.t load the price/i)
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => 'failure');
  try {
    return await Promise.any([success, failure]);
  } catch {
    return 'timeout';
  }
}

async function extractDetails(page) {
  const fullText = await page.locator('body').innerText();

  // Only parse the product header + price panel: everything above the
  // "Specifications" section. This keeps unrelated text lower on the page
  // (specs, footer, related items) from producing wrong prices or stock flags.
  const head = fullText.split(/\bspecifications\b/i)[0];
  const text = head.length > 80 ? head : fullText;

  const amounts = [...text.matchAll(/₹\s?([\d,]+)/g)].map((m) =>
    parseInt(m[1].replace(/,/g, ''), 10)
  );
  const finalPrice = amounts.length >= 3 ? amounts[2] : amounts[amounts.length - 1] ?? null;
  const originalPrice = amounts[0] ?? null;
  const dealPrice = amounts.length >= 2 ? amounts[1] : null;

  // --- stock: check "out" phrases first, then quantity, then explicit "in stock" ---
  const outOfStock = /\b(out of stock|sold out|not in stock|currently unavailable|unavailable|no stock)\b/i.test(text);
  const qtyMatch =
    text.match(/\b(?:only|just)\s+([\d,]+)\s+(?:units?\s+)?(?:left|remaining|available|in stock)\b/i) ||
    text.match(/\b([\d,]+)\s+(?:units?\s+)?(?:left|remaining|in stock|available)\b/i);
  const stockQty = qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, ''), 10) : null;
  const explicitInStock = /\b(in stock|low stock|few left|available now|ready to ship|ships (?:today|within))\b/i.test(text);

  const inStock = outOfStock ? false : stockQty != null ? stockQty > 0 : explicitInStock ? true : null;

  const discountMatch = text.match(/(\d+)%\s*off/i);
  const sellerMatch = text.match(/sold by\s+([^\n]+)/i);
  const deliveryMatch = text.match(/get it by\s+([^\n]+)/i);

  // Debug aid: lines that might describe stock, plus the raw panel text.
  // Stored in price_history.details so wrong/unknown parses can be inspected.
  const stockLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && /stock|left|avail|sold|ship|deliver/i.test(l))
    .slice(0, 6);

  return {
    finalPrice,
    originalPrice,
    dealPrice,
    discountPct: discountMatch ? parseInt(discountMatch[1], 10) : null,
    stockQty,
    inStock,
    seller: sellerMatch ? sellerMatch[1].trim() : null,
    deliveryEstimate: deliveryMatch ? deliveryMatch[1].trim() : null,
    stockLines,
    panelText: text.slice(-800).trim(),
  };
}