const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

export async function searchMangapill(title, limit = 10) {
    const r = await fetch(`${BASE}/search?q=${encodeURIComponent(title)}&limit=${limit}`);
    if (!r.ok) return [];
    return r.json();
}

export async function getMangapillManga(idOrUrl) {
    const r = await fetch(`${BASE}/manga?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`Mangapill manga failed: ${r.status}`);
    return r.json();
}

export async function getMangapillChapterPages(idOrUrl) {
    const r = await fetch(`${BASE}/chapter/pages?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`Mangapill pages failed: ${r.status}`);
    return r.json();
}
