const BASE = process.env.EXPO_PUBLIC_WEBCENTRAL_API || "http://localhost:8082";

export async function searchWeebcentral(query, limit = 20) {
    const r = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!r.ok) throw new Error(`WeebCentral search failed: ${r.status}`);
    return r.json();
}

export async function getWeebcentralManga(idOrUrl) {
    const r = await fetch(`${BASE}/manga?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`WeebCentral manga failed: ${r.status}`);
    return r.json();
}

export async function getWeebcentralChapterPages(idOrUrl) {
    const r = await fetch(`${BASE}/chapter/pages?id_or_url=${encodeURIComponent(idOrUrl)}`);
    if (!r.ok) throw new Error(`WeebCentral pages failed: ${r.status}`);
    return r.json();
}
