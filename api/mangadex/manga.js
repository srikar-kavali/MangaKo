const MANGADEX_API = 'https://api.mangadex.org';
const FEED_PAGE_SIZE = 100; // MangaDex's max per page for the feed endpoint

function coverUrl(mangaId, fileName, size = '512') {
    if (!fileName) return null;
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.${size}.jpg`;
}

function pickTitle(titleObj) {
    if (!titleObj) return 'Unknown';
    return titleObj.en || Object.values(titleObj)[0] || 'Unknown';
}

async function fetchAllChapters(mangaId, lang) {
    const chapters = [];
    let offset = 0;
    const MAX_PAGES = 50;

    for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams();
        params.append('translatedLanguage[]', lang);
        params.set('order[chapter]', 'asc');
        params.set('limit', String(FEED_PAGE_SIZE));
        params.set('offset', String(offset));
        params.set('includeFuturePublishAt', '0');

        const r = await fetch(`${MANGADEX_API}/manga/${mangaId}/feed?${params.toString()}`);
        if (!r.ok) break;
        const json = await r.json();
        const batch = json.data || [];

        for (const ch of batch) {
            const attrs = ch.attributes || {};
            if (!attrs.pages || attrs.pages <= 0) continue;
            chapters.push({
                id: ch.id,
                chapter: attrs.chapter,
                volume: attrs.volume,
                title: attrs.title || null,
                pages: attrs.pages,
                publishAt: attrs.publishAt,
                number: attrs.chapter != null ? parseFloat(attrs.chapter) : 0,
            });
        }

        const total = json.total ?? 0;
        offset += FEED_PAGE_SIZE;
        if (offset >= total || batch.length === 0) break;
    }

    const seen = new Set();
    const deduped = [];
    for (const ch of chapters.sort((a, b) => a.number - b.number)) {
        const key = ch.chapter ?? ch.id;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(ch);
    }
    return deduped;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, lang = 'en' } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    try {
        const params = new URLSearchParams();
        ['cover_art', 'author', 'artist'].forEach(inc => params.append('includes[]', inc));

        const [mangaRes, chapters] = await Promise.all([
            fetch(`${MANGADEX_API}/manga/${id}?${params.toString()}`),
            fetchAllChapters(id, lang),
        ]);

        if (!mangaRes.ok) {
            const text = await mangaRes.text();
            return res.status(mangaRes.status).json({ error: `MangaDex manga fetch failed: ${mangaRes.status}`, detail: text });
        }

        const mangaJson = await mangaRes.json();
        const item = mangaJson.data;
        const attrs = item.attributes || {};
        const rels = item.relationships || [];

        const coverRel = rels.find(r => r.type === 'cover_art');
        const authorRel = rels.find(r => r.type === 'author');
        const artistRel = rels.find(r => r.type === 'artist');

        return res.status(200).json({
            id: item.id,
            title: pickTitle(attrs.title),
            description: attrs.description?.en || '',
            status: attrs.status || null,
            year: attrs.year || null,
            genres: (attrs.tags || []).map(t => t.attributes?.name?.en).filter(Boolean),
            author: authorRel?.attributes?.name || null,
            artist: artistRel?.attributes?.name || null,
            cover: coverUrl(item.id, coverRel?.attributes?.fileName),
            chapters,
            source: 'mangadex',
        });
    } catch (e) {
        console.error('mangadex-manga error:', e);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}