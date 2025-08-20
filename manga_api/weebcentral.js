// manga_api/weebcentral.js
const BASE = process.env.EXPO_PUBLIC_WEEBCENTRAL_API; // ends with /api

export async function searchWeebcentral(mainTitle, altTitles = []) {
    const r = await fetch(`${BASE}/search-best`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: mainTitle, alt_titles: altTitles, limit: 40 }),
    });
    if (!r.ok) {
        console.log('search-best failed:', r.status);
        return null;
    }
    const data = await r.json();
    console.log('search-best ->', data);
    return data?.url ?? null;
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
