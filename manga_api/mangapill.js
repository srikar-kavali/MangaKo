const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

function cleanBase(base) {
    return base.endsWith("/") ? base.slice(0, -1) : base;
}
const API_BASE = cleanBase(BASE);

export function proxied(src) {
    if (!src) return "";
    if (src.startsWith(API_BASE)) return src;
    return `${API_BASE}/mangapill/image_proxy?url=${encodeURIComponent(src)}`;
}

export async function searchMangapill(title, limit = 10) {
    const url = `${API_BASE}/mangapill/search?q=${encodeURIComponent(title)}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`search failed: ${r.status} - ${text}`);
    }
    return r.json();
}

export async function getMangapillManga(mangaUrl) {
    const url = `${API_BASE}/mangapill/manga?url=${encodeURIComponent(mangaUrl)}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`manga failed: ${r.status} - ${text}`);
    }
    return r.json();
}

export async function getChapterPagesMangapill(chapterUrl) {
    const url = `${API_BASE}/mangapill/chapter_pages?url=${encodeURIComponent(chapterUrl)}`;
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
