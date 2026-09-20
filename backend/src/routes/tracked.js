import express from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { enqueue, scrapeProduct } from '../scraper/scrapeProduct.js';

const router = express.Router();

// POST /api/tracked  { productId, name, sku, category, brand }
// Saves the product, then kicks off its first scrape in the background so the
// user doesn't wait up to 2h for the next scheduled run.
router.post('/', async (req, res) => {
  const { productId, name, sku, category, brand } = req.body;
  if (!productId || !name) {
    return res.status(400).json({ error: 'productId and name are required' });
  }

  const { data: existing } = await supabase
    .from('tracked_products')
    .select('id')
    .eq('product_id', productId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('tracked_products')
    .upsert({ product_id: productId, name, sku, category, brand }, { onConflict: 'product_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  if (!existing) {
    enqueue(() => scrapeProduct(data)).catch((err) =>
      console.error(`[tracked] initial scrape failed for ${productId}:`, err)
    );
  }

  res.status(201).json(data);
});

// GET /api/tracked -> every tracked product + latest successful price + latest scrape attempt
router.get('/', async (req, res) => {
  const { data: tracked, error } = await supabase
    .from('tracked_products')
    .select('*')
    .order('tracked_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // N+1 queries: fine for a handful of products; a bigger version would use one SQL view.
  const enriched = await Promise.all(
    tracked.map(async (t) => {
      const [{ data: latest }, { data: last_scrape }] = await Promise.all([
        supabase
          .from('price_history')
          .select('*')
          .eq('tracked_product_id', t.id)
          .order('scraped_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('scrape_log')
          .select('outcome, attempted_at, detail')
          .eq('tracked_product_id', t.id)
          .order('attempted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return { ...t, latest: latest || null, last_scrape: last_scrape || null };
    })
  );

  res.json({ tracked: enriched });
});

export default router;