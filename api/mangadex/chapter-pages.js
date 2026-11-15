const MANGADEX_API = 'https://api.mangadex.org';
const CHAPTER_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const CHAPTER_HASH = /^[a-f0-9]{32,64}$/i;
const PAGE_FILE = /^[a-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i;

function pageBase(raw) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash ||
        !(url.hostname.endsWith('.mangadex.network') || url.hostname === 'uploads.mangadex.org')) {
        throw new Error('Invalid MangaDex@Home origin');
    }
    return url.href.replace(/\/+$/, '');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // MangaDex@Home chapter URLs are short-lived.
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { chapterId, quality = 'data' } = req.query;
    if (typeof chapterId !== 'string' || !CHAPTER_ID.test(chapterId)) {
        return res.status(400).json({ error: 'A valid chapterId is required' });
    }
    if (!['data', 'data-saver'].includes(quality)) {
        return res.status(400).json({ error: "quality must be 'data' or 'data-saver'" });
    }

    try {
        const r = await fetch(`${MANGADEX_API}/at-home/server/${chapterId}?forcePort443=true`, {
            signal: AbortSignal.timeout(8000),
            redirect: 'error',
        });
        if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: 'MangaDex chapter lookup failed' });

        const { result, baseUrl, chapter } = await r.json();
        const filenames = quality === 'data-saver' ? chapter?.dataSaver : chapter?.data;
        if (result !== 'ok' || typeof chapter?.hash !== 'string' || !CHAPTER_HASH.test(chapter.hash) ||
            !Array.isArray(filenames) || !filenames.length || !filenames.every(f => typeof f === 'string' && PAGE_FILE.test(f))) {
            return res.status(502).json({ error: 'MangaDex returned invalid chapter pages' });
        }

        const base = pageBase(baseUrl);
        const pages = filenames.map(filename => `${base}/${quality}/${chapter.hash}/${filename}`);
        return res.status(200).json({ pages, hash: chapter.hash, quality });
    } catch {
        return res.status(502).json({ error: 'Unable to retrieve MangaDex chapter pages' });
    }
}
