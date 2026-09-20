import express from 'express';

const router = express.Router();
const STORE = process.env.STORE_BASE_URL;

// In-memory cache so a burst of searches doesn't re-crawl the catalog.
let cache = { products: [], fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

const pickItems = (data) =>
  Array.isArray(data) ? data : data.items || data.products || data.results || data.data || [];
const itemKey = (p) => p.id ?? p.productId ?? p.sku ?? p.name;

async function fetchAllProducts() {
  const now = Date.now();
  if (cache.products.length && now - cache.fetchedAt < CACHE_TTL_MS) return cache.products;

  const pageSize = 100;
  const seen = new Map(); // dedupe by id
  let page = 1;

  // Cap so a bug can't loop forever and hammer the store.
  while (page <= 50) {
    const res = await fetch(`${STORE}/api/catalog?page=${page}&pageSize=${pageSize}`);
    if (!res.ok) {
      // A failure on page 1 must be loud, not an empty result list.
      if (page === 1) throw new Error(`catalog endpoint responded ${res.status}`);
      break;
    }
    const data = await res.json();
    const items = pickItems(data);

    if (page === 1) {
      console.log('[search] catalog top-level keys:', Array.isArray(data) ? '(array)' : Object.keys(data));
      console.log('[search] page 1 item count:', items.length, '| first item:', items[0]);
    }
    if (!items.length) break;

    const before = seen.size;
    for (const p of items) seen.set(itemKey(p), p);

    // NOTE: do NOT stop just because items.length < pageSize. The store may
    // cap the page size lower than we asked for.
    if (seen.size === before) break; // nothing new: API is ignoring `page`, or we're past the end
    if (data.hasMore === false || (data.totalPages && page >= data.totalPages)) break;
    page++;
  }

  if (!seen.size) throw new Error('catalog returned no products (wrong endpoint or response shape?)');
  console.log(`[search] cached ${seen.size} products across ${page} page(s)`);
  cache = { products: [...seen.values()], fetchedAt: now };
  return cache.products;
}

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    const all = await fetchAllProducts();

    // Every word in the query must appear somewhere in name/brand/sku,
    // so "domus toaster" and "toaster mini domus" both work.
    const words = q.split(/\s+/).filter(Boolean);
    const matches = words.length
      ? all.filter((p) => {
          const hay = `${p.name ?? p.title ?? ''} ${p.brand ?? ''} ${p.sku ?? ''}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : all.slice(0, 20);

    res.json({ results: matches.slice(0, 25), totalCatalog: all.length });
  } catch (err) {
    console.error('Search failed:', err);
    res.status(502).json({ error: `Could not search the store: ${err.message}` });
  }
});

export default router;