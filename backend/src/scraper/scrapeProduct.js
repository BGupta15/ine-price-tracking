import { supabase } from '../lib/supabaseClient.js';
import { revealPrice } from './revealPrice.js';

// One browser at a time: every scrape (cron run or "just tracked") goes through
// this queue so they never overlap. That keeps memory low on the free tier.
let chain = Promise.resolve();
export function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

/** Scrape one tracked product and record the outcome honestly. */
export async function scrapeProduct(product) {
  let result;
  try {
    result = await revealPrice(product.product_id);
  } catch (err) {
    result = { success: false, attempts: 1, outcome: 'failed', detail: `Unexpected scraper crash: ${err.message}` };
  }

  const { error: logErr } = await supabase.from('scrape_log').insert({
    tracked_product_id: product.id,
    outcome: result.outcome,
    attempts: result.attempts,
    detail: result.detail || (result.success ? `price: ${result.price}` : null),
  });
  if (logErr) console.error(`[scrape] could not write log for ${product.product_id}:`, logErr.message);

  // Only successful, price-bearing scrapes ever reach price_history.
  if (result.success) {
    const { error: histErr } = await supabase.from('price_history').insert({
      tracked_product_id: product.id,
      price: result.price,
      in_stock: result.inStock,
      stock_qty: result.stockQty,
      details: result.details,
    });
    if (histErr) console.error(`[scrape] could not write history for ${product.product_id}:`, histErr.message);
  }

  return { productId: product.product_id, outcome: result.outcome, attempts: result.attempts, price: result.price ?? null };
}