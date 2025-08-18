const BASE = process.env.EXPO_PUBLIC_WEBCENTRAL_API || "https://manga-ko.vercel.app";

export async function searchWeebcentral(query, limit = 20) {
    const r = await fetch(`${BASE}/api/index/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!r.ok) throw new Error(`WeebCentral search failed: ${r.status}`);
    return r.json();
}

export async function getWeebcentralManga(idOrUrl) {
    const r = await fetch(`${BASE}/api/index/manga?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`WeebCentral manga failed: ${r.status}`);
    return r.json();
}

export async function getWeebcentralChapterPages(idOrUrl) {
    const r = await fetch(`${BASE}/api/index/chapter/pages?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`WeebCentral pages failed: ${r.status}`);
    return r.json();
}
