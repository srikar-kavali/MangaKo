const BASE = process.env.EXPO_PUBLIC_CHAPTERS_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);

const MANGADEX_PREFIX = 'mangadex__';
export function toMangadexKey(rawId) {
    if (!rawId) return rawId;
    return rawId.startsWith(MANGADEX_PREFIX) ? rawId : `${MANGADEX_PREFIX}${rawId}`;
}
export function fromMangadexKey(key) {
    if (!key) return key;
    return key.startsWith(MANGADEX_PREFIX) ? key.slice(MANGADEX_PREFIX.length) : key;
}

export function toMangadexChapterKey(chapterNumber, uuid) {
    const num = (chapterNumber === null || chapterNumber === undefined) ? '0' : String(chapterNumber);
    return `${num}__${uuid}`;
}
export function splitMangadexChapterKey(composite) {
    if (!composite) return { number: null, uuid: null };
    const idx = String(composite).indexOf('__');
    if (idx < 0) return { number: null, uuid: composite }; // fallback: bare uuid was stored
    return { number: composite.slice(0, idx), uuid: composite.slice(idx + 2) };
}

export function proxied(src) {
    if (!src) return "";
    return src;
}

export async function searchMangadex(title, limit = 20) {
    const url = `${API_BASE}/api/mangadex/search?q=${encodeURIComponent(title)}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`mangadex search failed: ${r.status} - ${text}`);
    }
    const json = await r.json();
    const results = json.results || [];
    return results.map(item => ({ ...item, id: toMangadexKey(item.id) }));
}

export async function getMangadexManga(mangaKeyOrId) {
    const rawId = fromMangadexKey(mangaKeyOrId);
    const url = `${API_BASE}/api/mangadex/manga?id=${encodeURIComponent(rawId)}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`mangadex manga failed: ${r.status} - ${text}`);
    }
    return r.json();
}

export async function getChapterPagesMangadex(chapterId, quality = 'data') {
    const url = `${API_BASE}/api/mangadex/chapter-pages?chapterId=${encodeURIComponent(chapterId)}&quality=${quality}`;
    const r = await fetch(url);
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`mangadex chapter pages failed: ${r.status} - ${text}`);
    }
    const json = await r.json();
    return json.pages || [];
}