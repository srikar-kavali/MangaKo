const BASE = process.env.EXPO_PUBLIC_CHAPTERS_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);

export function proxied(src) {
    if (!src) return "";
    return `${API_BASE}/api/image_proxy?url=${encodeURIComponent(src)}`;
}

// Live Mgeko search is independent of the small curated title catalog.
export async function searchMgeko(query, limit = 30, page = 1, signal) {
    if (!API_BASE) throw new Error('EXPO_PUBLIC_CHAPTERS_API is not configured');
    const params = new URLSearchParams({ q: query, limit: String(limit), page: String(page) });
    const response = await fetch(API_BASE + '/api/mgeko-search?' + params.toString(), { signal });
    if (!response.ok) throw new Error('Mgeko search unavailable (HTTP ' + response.status + ')');
    const json = await response.json();
    if (!Array.isArray(json.results)) throw new Error('Invalid Mgeko search results');
    return json.results;
}
