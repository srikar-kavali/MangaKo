const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}
const API_BASE = cleanBase(BASE);

export async function browseMangapill(limit = 24) {
    if (!API_BASE) throw new Error('EXPO_PUBLIC_MANGAPILL_API is not configured');
    const response = await fetch(`${API_BASE}/api/mangapill/browse?limit=${Math.max(1, Math.min(48, limit))}`);
    if (!response.ok) throw new Error(`MangaPill discovery failed: ${response.status} at ${API_BASE}/api/mangapill/browse`);
    const results = await response.json();
    return Array.isArray(results) ? results : [];
}

// Saved library entries may contain proxy URLs from older Vercel deployments.
// Unwrap only known MangaKo image-proxy paths; the backend still validates the
// original image host against its allowlist.
export function unwrapImageProxyUrl(src) {
    if (typeof src !== 'string') return '';
    let current = src;
    for (let i = 0; i < 5; i++) {
        try {
            const parsed = new URL(current);
            if (parsed.pathname !== '/api/image_proxy') break;
            const original = parsed.searchParams.get('url');
            if (!original || !/^https:\/\//i.test(original) || original === current) break;
            current = original;
        } catch {
            break;
        }
    }
    return current;
}

export function proxied(src) {
    const original = unwrapImageProxyUrl(src);
    if (!original || !API_BASE) return '';
    return `${API_BASE}/api/image_proxy?url=${encodeURIComponent(original)}`;
}

export async function searchMangapill(title, limit = 10) {
    const url = `${API_BASE}/api/mangapill/search?q=${encodeURIComponent(title)}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`search failed: ${r.status} - ${text}`);
    }
    console.log(`${API_BASE}/search/?q=${encodeURIComponent(title)}&limit=${limit}`);
    return r.json();
}

export async function getMangapillManga(mangaUrl) {
    const url = `${API_BASE}/api/mangapill/manga?url=${encodeURIComponent(mangaUrl)}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`manga failed: ${r.status} - ${text}`);
    }
    return r.json();
}

export async function getChapterPagesMangapill(chapterUrl) {
    const url = `${API_BASE}/api/mangapill/chapter_pages?url=${encodeURIComponent(chapterUrl)}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`chapter pages failed: ${r.status} - ${text}`);
    }
    return r.json();
}

export function normalizeMangapill(data) {
    if (!data) return null;

    return {
        id: data.url,
        title: data.title || "From Mangapill",
        description: data.description || "No extra metadata available from Mangapill.",
        authors: ["From Mangapill"],
        artists: ["From Mangapill"],
        tags: ["Mangapill"],
        coverUrl: data.image ? proxied(data.image) : null,
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
        source: "Mangapill",
    };
}