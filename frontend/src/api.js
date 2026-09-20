const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  listTracked: () => request('/api/tracked'),
  track: (product) =>
    request('/api/tracked', { method: 'POST', body: JSON.stringify(product) }),
  history: (id) => request(`/api/tracked/${id}/history`),
  log: (id) => request(`/api/tracked/${id}/log`),
};
