const MANGADEX_API = 'https://api.mangadex.org';
function coverUrl(mangaId, fileName, size = '256') {
    if (!fileName) return null;
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.${size}.jpg`;
}

function pickTitle(titleObj) {
    if (!titleObj) return 'Unknown';
    return titleObj.en || Object.values(titleObj)[0] || 'Unknown';
}

function normalizeManga(item) {
    const coverRel = (item.relationships || []).find(r => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    return {
        id: item.id,
        title: pickTitle(item.attributes?.title),
        description: item.attributes?.description?.en || '',
        status: item.attributes?.status || null,
        year: item.attributes?.year || null,
        tags: (item.attributes?.tags || []).map(t => t.attributes?.name?.en).filter(Boolean),
        cover: coverUrl(item.id, fileName),
        source: 'mangadex',
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { q = '', limit = '20' } = req.query;
    if (!String(q).trim()) {
        return res.status(200).json({ results: [] });
    }

    try {
        const params = new URLSearchParams();
        params.set('title', q);
        params.set('limit', String(Math.min(Number(limit) || 20, 50)));
        params.append('includes[]', 'cover_art');
        // Pornographic excluded by default — keep safe/suggestive/erotica.
        ['safe', 'suggestive', 'erotica'].forEach(r => params.append('contentRating[]', r));
        params.set('order[relevance]', 'desc');

        const r = await fetch(`${MANGADEX_API}/manga?${params.toString()}`);
        if (!r.ok) {
            const text = await r.text();
            return res.status(r.status).json({ error: `MangaDex search failed: ${r.status}`, detail: text });
        }
        const json = await r.json();
        const results = (json.data || []).map(normalizeManga);
        return res.status(200).json({ results, total: json.total ?? results.length });
    } catch (e) {
        console.error('mangadex-search error:', e);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}