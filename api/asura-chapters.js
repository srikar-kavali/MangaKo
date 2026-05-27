// api/asura-chapters.js
// Reads from Supabase at runtime — no redeploy needed ever.
// main.py uploads new chapters → Supabase → app sees them within minutes.
//

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { seriesId, chapterId } = req.query;
    if (!seriesId) return res.status(400).json({ error: 'seriesId is required' });

    try {
        // ── Single chapter pages ───────────────────────────────────────────────
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

            return res.status(200).json({ pages: data.pages });
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

        // Cache at CDN edge 5 min — new chapters appear within 5 min of upload
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

        return res.status(200).json({ chapters, total: chapters.length });

    } catch (e) {
        console.error('asura-chapters error:', e.message);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}