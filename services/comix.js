/**
 * Experimental Comix adapter. Disabled by default; does not change MangaKo routes.
 * Unofficial third-party API: confirm usage rights before public deployment.
 */
const DEFAULT_API = 'https://comix-api.vercel.app';
const MAX_TIMEOUT_MS = 8000;

function apiBase() {
  const base = process.env.EXPO_PUBLIC_COMIX_API || DEFAULT_API;
  const parsed = new URL(base);
  if (parsed.protocol !== 'https:') throw new Error('Comix API must use HTTPS');
  return parsed.origin;
}

export function isComixEnabled() {
  return process.env.EXPO_PUBLIC_ENABLE_COMIX === 'true';
}

function requireEnabled() {
  if (!isComixEnabled()) throw new Error('Comix proof of concept is disabled');
}

function imageUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('/api/image?')) return apiBase() + value;
  if (value.startsWith('https://')) return value;
  return null;
}

async function request(path) {
  requireEnabled();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  try {
    const response = await fetch(apiBase() + path, { signal: controller.signal });
    if (!response.ok) throw new Error('Comix API HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeComixTitle(item) {
  if (!item || !item.id || !item.title) return null;
  return {
    id: String(item.id),
    title: String(item.title),
    source: 'comix',
    cover: imageUrl(item.cover || item.img),
    status: item.status ?? null,
    type: item.type || null,
    description: item.synopsis || item.description || '',
  };
}

/** Only search metadata; never scrape chapter images. */
export async function searchComix(query, { page = 1, limit = 12 } = {}) {
  if (!query || !query.trim()) return { results: [], pagination: null };
  const params = new URLSearchParams({
    q: query.trim(),
    sfw: 'true',
    page: String(Math.max(1, Math.floor(page))),
    limit: String(Math.max(1, Math.min(25, Math.floor(limit)))),
  });
  const data = await request('/api/manga/search?' + params);
  if (!Array.isArray(data.results)) throw new Error('Unexpected Comix search response');
  return {
    results: data.results.map(normalizeComixTitle).filter(Boolean),
    pagination: data.pagination || null,
  };
}

/** Fetch title metadata only; do not auto-route into MangaKo's reader. */
export async function getComixDetails(id) {
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(String(id))) throw new Error('Invalid Comix ID');
  const data = await request('/api/manga/' + encodeURIComponent(id) + '?sfw=true');
  if (!data?.comic) throw new Error('Unexpected Comix details response');
  return { ...data.comic, normalized: normalizeComixTitle(data.comic) };
}

export async function getComixChapters(id, { page = 1, limit = 30 } = {}) {
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(String(id))) throw new Error('Invalid Comix ID');
  const params = new URLSearchParams({
    page: String(Math.max(1, Math.floor(page))),
    limit: String(Math.max(1, Math.min(50, Math.floor(limit)))),
  });
  const data = await request('/api/manga/' + encodeURIComponent(id) + '/chapters?' + params);
  // Keep upstream chapter schema raw until verified with live data.
  if (!data || typeof data !== 'object') throw new Error('Unexpected Comix chapter response');
  return data;
}
