const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

// Build a proxied URL for images so iOS can render (no webp issues)
export function proxied(src) {
    // Avoid double-proxying
    if (!src) return "";
    if (src.startsWith(BASE)) return src;
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
