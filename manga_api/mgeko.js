const BASE = process.env.EXPO_PUBLIC_CHAPTERS_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);
const IMAGE_PROXY_BASE = (process.env.EXPO_PUBLIC_IMAGE_PROXY_URL || API_BASE || '').replace(/\/+$/, '');

export function proxied(src) {
    if (!src) return "";
    return `${IMAGE_PROXY_BASE}${IMAGE_PROXY_BASE.includes('workers.dev') ? '' : '/api/image_proxy'}?url=${encodeURIComponent(src)}`;
}

// Live Mgeko search is independent of the small curated title catalog.
export async function searchMgeko(query, limit = 30, page = 1, signal) {
    if (!API_BASE) throw new Error('EXPO_PUBLIC_CHAPTERS_API is not configured');
    const params = new URLSearchParams({ provider: 'mgeko', q: query, limit: String(limit), page: String(page) });
    const response = await fetch(API_BASE + '/api/mangapill/search?' + params.toString(), { signal });
    if (!response.ok) throw new Error('Mgeko search unavailable (HTTP ' + response.status + ')');
    const json = await response.json();
    if (!Array.isArray(json.results)) throw new Error('Invalid Mgeko search results');
    return json.results;
}
