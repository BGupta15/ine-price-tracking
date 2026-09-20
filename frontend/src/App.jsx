import { useEffect, useState } from 'react';
import { api } from './api.js';

const PENDING_WINDOW_MS = 10 * 60 * 1000; // a just-tracked product is "scraping" for up to 10 min

// A product is pending if it was just tracked and no scrape has been recorded yet.
function isPending(t) {
  return (
    !t.latest &&
    !t.last_scrape &&
    Date.now() - new Date(t.tracked_at).getTime() < PENDING_WINDOW_MS
  );
}

function statusText(t) {
  if (t.latest) {
    const stock =
      t.latest.in_stock === true ? 'In stock' : t.latest.in_stock === false ? 'Out of stock' : 'Stock unknown';
    const warn = t.last_scrape?.outcome === 'failed' ? ' · last scrape failed' : '';
    return `₹${t.latest.price ?? '—'} · ${stock}${warn}`;
  }
  if (t.last_scrape?.outcome === 'failed') return 'Last scrape failed. Will retry on schedule';
  if (isPending(t)) return 'Scraping now…';
  return 'Not scraped yet. Next scheduled run within 2h';
}

// Dependency-free SVG line chart of price over time.
function PriceChart({ history }) {
  const pts = history.filter((h) => h.price != null);
  if (pts.length < 2) return <p className="muted">Chart appears after two successful scrapes.</p>;

  const W = 640, H = 180, P = 36;
  const prices = pts.map((h) => Number(h.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - min) * (H - 2 * P)) / span;
  const line = pts.map((h, i) => `${x(i)},${y(Number(h.price))}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }} role="img" aria-label="Price over time">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
      {pts.map((h, i) => (
        <circle key={h.id} cx={x(i)} cy={y(Number(h.price))} r="3.5" fill="currentColor">
          <title>{`${new Date(h.scraped_at).toLocaleString()}: ₹${h.price}`}</title>
        </circle>
      ))}
      <text x={P} y={14} fontSize="11" fill="currentColor">₹{max}</text>
      <text x={P} y={H - 10} fontSize="11" fill="currentColor">₹{min}</text>
    </svg>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [tracked, setTracked] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [log, setLog] = useState([]);

  useEffect(() => {
    loadTracked();
  }, []);

  // While any just-tracked product is still being scraped, poll every 5s,
  // and refresh the open product's history/log so new rows show up.
  const anyPending = tracked.some(isPending);
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => {
      loadTracked();
      if (selectedId) loadDetails(selectedId);
    }, 5000);
    return () => clearInterval(id);
  }, [anyPending, selectedId]);

  async function loadTracked() {
    try {
      const data = await api.listTracked();
      setTracked(data.tracked);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadDetails(id) {
    try {
      const [h, l] = await Promise.all([api.history(id), api.log(id)]);
      setHistory(h.history);
      setLog(l.log);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const data = await api.search(query);
      setResults(data.results);
      setSearched(true);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleTrack(product) {
    try {
      await api.track({
        productId: product.id ?? product.productId,
        name: product.name ?? product.title,
        sku: product.sku,
        category: product.category,
        brand: product.brand,
      });
      await loadTracked();
    } catch (err) {
      alert(`Couldn't track this product: ${err.message}`);
    }
  }

  async function handleSelect(t) {
    setSelectedId(t.id);
    await loadDetails(t.id);
  }

  const selected = tracked.find((t) => t.id === selectedId);

  return (
    <div className="page">
      <header>
        <h1>Price Tracker</h1>
        <p className="subtitle">Track products from the INE store and watch their price and stock over time.</p>
      </header>

      <section>
        <h2>Search products</h2>
        <form onSubmit={handleSearch} className="search-form">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product name..."
          />
          <button type="submit" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
        {searchError && <p className="error">{searchError}</p>}
        {searched && !searching && !searchError && results.length === 0 && (
          <p className="muted">No products matched "{query}".</p>
        )}

        {results.length > 0 && (
          <ul className="result-list">
            {results.map((p) => (
              <li key={p.id ?? p.productId}>
                <div>
                  <strong>{p.name ?? p.title}</strong>
                  {p.brand && <span className="muted"> — {p.brand}</span>}
                  {p.sku && <span className="muted"> · SKU {p.sku}</span>}
                </div>
                <button onClick={() => handleTrack(p)}>Track</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Previously Tracked products</h2>
        {tracked.length === 0 && <p className="muted">Nothing tracked yet. Search above and add one.</p>}
        <ul className="tracked-list">
          {tracked.map((t) => (
            <li
              key={t.id}
              className={t.id === selectedId ? 'selected' : ''}
              onClick={() => handleSelect(t)}
            >
              <div>
                <strong>{t.name}</strong>
                {t.brand && <span className="muted"> — {t.brand}</span>}
              </div>
              <div className="muted">{statusText(t)}</div>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section>
          <h2>{selected.name} — history</h2>

          <h3>Price &amp; stock over time</h3>
          {history.length === 0 ? (
            <p className="muted">No successful scrapes yet.</p>
          ) : (
            <>
              <PriceChart history={history} />
              <table>
                <thead>
                  <tr>
                    <th>Scraped at</th>
                    <th>Price</th>
                    <th>In stock</th>
                    <th>Stock qty</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{new Date(h.scraped_at).toLocaleString()}</td>
                      <td>₹{h.price}</td>
                      <td>{h.in_stock === null ? '—' : h.in_stock ? 'Yes' : 'No'}</td>
                      <td>{h.stock_qty ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Scrape log</h3>
          {log.length === 0 ? (
            <p className="muted">No scrape attempts logged yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Attempted at</th>
                  <th>Outcome</th>
                  <th>Attempts</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className={`outcome-${l.outcome}`}>
                    <td>{new Date(l.attempted_at).toLocaleString()}</td>
                    <td>{l.outcome}</td>
                    <td>{l.attempts}</td>
                    <td>{l.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}