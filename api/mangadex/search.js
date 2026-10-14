import { createClient } from '@supabase/supabase-js';

const MANGADEX_API = 'https://api.mangadex.org';
const CACHE_SECONDS = 900;
const getCache = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
};
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
        originalLanguage: item.attributes?.originalLanguage || null,
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

    const { q = '', limit = '20', offset = '0', language = '' } = req.query;
    const searchTerm = String(q).trim();
    const pageSize = Math.max(1, Math.min(Number(limit) || 20, 50));
    const pageOffset = Math.max(0, Math.min(Number(offset) || 0, 10000));

    try {
        const cache = getCache();
        const cacheKey = `mangadex:${JSON.stringify({ q: searchTerm, limit: pageSize, offset: pageOffset, language })}`;
        if (cache) {
            try {
                const { data } = await cache.from('catalog_cache').select('payload,expires_at').eq('cache_key', cacheKey).maybeSingle();
                if (data && new Date(data.expires_at).getTime() > Date.now()) {
                    res.setHeader('X-Catalog-Cache', 'HIT');
                    return res.status(200).json(data.payload);
                }
            } catch (error) {
                console.warn('Catalog cache lookup failed:', error.message);
            }
        }
        const params = new URLSearchParams();
        if (searchTerm) params.set('title', searchTerm);
        params.set('limit', String(pageSize));
        params.set('offset', String(pageOffset));
        if (['ko', 'ja', 'zh'].includes(language)) params.append('originalLanguage[]', language);
        params.append('includes[]', 'cover_art');
        ['safe', 'suggestive'].forEach(r => params.append('contentRating[]', r));
        params.set(searchTerm ? 'order[relevance]' : 'order[latestUploadedChapter]', 'desc');

        const r = await fetch(`${MANGADEX_API}/manga?${params.toString()}`);
        if (!r.ok) {
            const text = await r.text();
            return res.status(r.status).json({ error: `MangaDex search failed: ${r.status}`, detail: text });
        }
        const json = await r.json();
        const results = (json.data || []).map(normalizeManga);
        const payload = { results, total: json.total ?? results.length, offset: pageOffset, limit: pageSize };
        if (cache) {
            try {
                await cache.from('catalog_cache').upsert({
                    cache_key: cacheKey, payload,
                    expires_at: new Date(Date.now() + CACHE_SECONDS * 1000).toISOString(),
                });
            } catch (error) {
                console.warn('Catalog cache write failed:', error.message);
            }
        }
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(payload);
    } catch (e) {
        console.error('mangadex-search error:', e);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}