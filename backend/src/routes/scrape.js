import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { enqueue, scrapeProduct } from '../scraper/scrapeProduct.js';

const router = express.Router();
let running = false; // prevents overlapping cron runs

async function runAll() {
  const { data: tracked, error } = await supabase.from('tracked_products').select('*');
  if (error) throw new Error(error.message);

  const results = [];
  for (const product of tracked) {
    results.push(await enqueue(() => scrapeProduct(product)));
  }
  return results;
}

// POST /api/scrape/run?secret=...           -> 202 immediately, scrapes in background (for cron-job.org)
// POST /api/scrape/run?secret=...&wait=true -> waits and returns results (manual testing)
router.post('/run', async (req, res) => {
  const secret = req.query.secret || req.headers['x-scrape-secret'];
  if (secret !== process.env.SCRAPE_TRIGGER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (running) return res.status(409).json({ error: 'a scrape run is already in progress' });
  running = true;

  if (req.query.wait === 'true') {
    try {
      const results = await runAll();
      return res.json({ ranAt: new Date().toISOString(), count: results.length, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    } finally {
      running = false;
    }
  }

  res.status(202).json({ started: new Date().toISOString() });
  runAll()
    .then((r) => console.log(`[scrape] run finished: ${r.length} products`))
    .catch((err) => console.error('[scrape] run failed:', err))
    .finally(() => { running = false; });
});

export default router;