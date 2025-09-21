const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

// Build a proxied URL for images so iOS can render (no webp issues)
export function proxied(src) {
    if (!src) return "";
    if (src.startsWith(BASE)) return src; // avoid double-proxying
    return `${BASE}/image_proxy?url=${encodeURIComponent(src)}`;
}

export async function searchMangapill(title, limit = 10) {
    const url = `${BASE}/search?q=${encodeURIComponent(title)}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`search failed: ${r.status}`);
    return r.json();
}

export async function getMangapillManga(mangaUrl) {
    const url = `${BASE}/manga?url=${encodeURIComponent(mangaUrl)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`manga failed: ${r.status}`);
    return r.json();
}

export async function getChapterPagesMangapill(chapterUrl) {
    const url = `${BASE}/chapter_pages?url=${encodeURIComponent(chapterUrl)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`chapter pages failed: ${r.status}`);
    return r.json();
}

// Normalize Mangapill result into a consistent structure
export function normalizeMangapill(data) {
    if (!data) return null;

    return {
        id: data.url,                           // use URL as unique ID
        title: data.title || "From Mangapill",  // always fallback to Mangapill marker
        description: data.description || "No extra metadata available from Mangapill.",
        authors: ["From Mangapill"],            // placeholder to avoid "Unknown"
        artists: ["From Mangapill"],            // placeholder
        tags: ["Mangapill"],                    // so tags section isn't empty
        coverUrl: data.image ? proxied(data.image) : null,
        chapters: Array.isArray(data.chapters) ? data.chapters : [],
        source: "Mangapill"
    };
}
