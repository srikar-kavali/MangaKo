// api/mgeko-chapters.js
// Serves MgEko chapter data from Supabase — same structure as asura-chapters.js
// Filters out junk URLs (credits image, gifs) before returning pages.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const JUNK = [
    /credits[-_]?mgeko/i,
    /\.gif(\?.*)?$/i,
    /comment/i,
    /advertisement/i,
    /banner/i,
    /disqus/i,
    /gravatar/i,
    /avatar(?!.*chapter)/i, // avatar in path but not chapter pages
];

function filterPages(urls) {
    if (!Array.isArray(urls)) return [];
    return urls.filter(url => {
        if (!url || typeof url !== 'string') return false;
        return !JUNK.some(r => r.test(url));
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { seriesId, chapterId } = req.query;
    if (!seriesId) return res.status(400).json({ error: 'seriesId is required' });

    try {
        // ── Single chapter pages ──────────────────────────────────────────────
        if (chapterId) {
            const { data, error } = await supabase
                .from('chapters')
                .select('pages')
                .eq('series_id', seriesId)
                .eq('chapter_id', chapterId)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: `Chapter ${chapterId} not found` });
            }

            // Filter junk pages before returning
            const pages = filterPages(data.pages);
            return res.status(200).json({ pages });
        }

        // ── Chapter list for a series ─────────────────────────────────────────
        const { data, error } = await supabase
            .from('chapters')
            .select('chapter_id')
            .eq('series_id', seriesId);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ error: `Series not found: ${seriesId}`, chapters: [], total: 0 });
        }

        const chapters = data
            .map(row => ({
                id: row.chapter_id,
                title: `Chapter ${row.chapter_id}`,
                number: parseFloat(row.chapter_id) || 0,
            }))
            .sort((a, b) => a.number - b.number);

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
        return res.status(200).json({ chapters, total: chapters.length });

    } catch (e) {
        console.error('mgeko-chapters error:', e.message);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}