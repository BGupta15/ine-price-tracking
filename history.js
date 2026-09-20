import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// GET /api/tracked/:id/history
router.get('/:id/history', async (req, res) => {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('tracked_product_id', req.params.id)
    .order('scraped_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data });
});

// GET /api/tracked/:id/log
router.get('/:id/log', async (req, res) => {
  const { data, error } = await supabase
    .from('scrape_log')
    .select('*')
    .eq('tracked_product_id', req.params.id)
    .order('attempted_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ log: data });
});

export default router;
