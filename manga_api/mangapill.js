const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}
const API_BASE = cleanBase(BASE);
const IMAGE_PROXY_BASE = (process.env.EXPO_PUBLIC_IMAGE_PROXY_URL || API_BASE || '').replace(/\/+$/, '');

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
    if (!original || !IMAGE_PROXY_BASE) return '';
    return `${IMAGE_PROXY_BASE}${IMAGE_PROXY_BASE.includes('workers.dev') ? '' : '/api/image_proxy'}?url=${encodeURIComponent(original)}`;
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


// MangaPill series names may include numbers (for example Lv999).
// Use the displayed chapter name or an explicit chapter marker in the URL.
export function mangapillChapterNumber(chapter) {
    const label = String(chapter?.name || chapter?.title || '');
    const labelMatch = label.match(/(?:^|\b)(?:chapter|ch\.?)\s*[:#._-]?\s*(\d+(?:\.\d+)?)/i);
    if (labelMatch) return Number(labelMatch[1]);
    if (typeof chapter?.number === 'number' && Number.isFinite(chapter.number)) return chapter.number;
    const url = String(chapter?.url || chapter?.id || '');
    const slug = url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    const urlMatch = slug.match(/(?:^|[-_])(?:chapter|ch)[-_]?(\d+(?:[._]\d+)?)(?:$|[-_])/i);
    return urlMatch ? Number(urlMatch[1].replace('_', '.')) : null;
}

export function mangapillChapterLabel(chapter) {
    const number = mangapillChapterNumber(chapter);
    if (number !== null) return 'Ch. ' + number;
    return String(chapter?.name || chapter?.title || 'Chapter').trim() || 'Chapter';
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