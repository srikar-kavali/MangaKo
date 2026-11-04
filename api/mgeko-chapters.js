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


// Live chapter index is an optional freshness layer over the existing
// Supabase archive. Only public Mgeko series slugs are accepted.
// Keep in sync with extractor/sites/mgeko.py SLUG_OVERRIDES (reverse direction).
// The internal library ID is stable, but upstream series sometimes use an
// unrelated URL slug. Preserve stored favorites and reading progress.
const SERIES_SLUG_ALIASES = {
    'noblesse': 'manga-pl822',
    'tower-of-god': 'manga-si7aaa',
    'eleceed': 'manga-q1113',
    'the-boxer': 'manga-187j',
    'the-god-of-high-school': '7237',
    'legend-of-the-northern-blade': 'northern-b-manhwa',
    'leviathan': 'leviathansdads',
    'wind-breaker': 'wind-breaker-cs',
    'memoir-of-the-king-of-war': 'memoir-of-the-king-of-war-sop',
    'chronicles-of-the-heavenly-demon': 'chronicles-of-heavenly-demon-mg1',
    'the-breaker-eternal-force': 'eternal-force',
    'the-breaker': 'the-breaker22',
    'the-story-of-a-low-rank-soldier-becoming-a-monarch': 'the-story-of-a-low-rank-soldier-becoming-a-monarch-mg1',
    'mage-again': 'manga-mm990169',
    'hardcore-leveling-warrior': 'manga-1089',
};
function seriesSlug(id) {
    const raw = String(id || '').replace(/^mgeko__/, '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) return null;
    return SERIES_SLUG_ALIASES[raw] || raw;
}
async function fetchLiveChapters(slug) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
        const response = await fetch(`https://www.mgeko.cc/manga/${slug}/all-chapters/`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MangaKo/1.0)', Accept: 'text/html' },
            signal: controller.signal,
        });
        if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return [];
        const html = (await response.text()).slice(0, 2_000_000);
        const escaped = slug; // seriesSlug restricts slugs to safe URL characters
        const re = new RegExp(`(?:https?:\\/\\/www\\.mgeko\\.cc)?\\/reader\\/en\\/${escaped}-chapter-([0-9]+(?:-[0-9]+)?)-eng-li\\/?`, 'gi');
        const numbers = new Set();
        for (const match of html.matchAll(re)) {
            numbers.add(match[1].replace('-', '.'));
            if (numbers.size >= 1500) break;
        }
        return [...numbers].map(id => ({
            id, title: `Chapter ${id}`, number: Number(id),
        })).filter(ch => Number.isFinite(ch.number));
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
}


async function resolveLivePages(slug, chapterId) {
    if (!slug || !/^[0-9]+(?:\.[0-9]+)?$/.test(String(chapterId))) return [];
    const chapterSlug = String(chapterId).replace('.', '-');
    const url = `https://www.mgeko.cc/reader/en/${slug}-chapter-${chapterSlug}-eng-li/`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MangaKo/1.0)', Accept: 'text/html' },
            signal: controller.signal,
        });
        if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return [];
        const html = (await response.text()).slice(0, 4_000_000)
            .replace(/&amp;/g, '&').replace(/\\\\\//g, '/');
        // Extract only image paths for this chapter. Matches standard src,
        // data-src and URLs embedded in script literals, preserving order.
        const escapedSlug = slug;
        const chapterPath = `/comic/${escapedSlug}/chapter-${chapterSlug}/`;
        const matches = html.match(/https?:\/\/[a-z0-9.-]+\/[^"'<> \t\r\n]+?\.(?:jpe?g|png|webp)(?:\?[^"'<> \t\r\n]*)?/gi) || [];
        const unique = new Set();
        for (const raw of matches) {
            try {
                const parsed = new URL(raw);
                if (!/^imgsrv[0-9]+\.com$/.test(parsed.hostname)) continue;
                if (!parsed.pathname.includes(chapterPath)) continue;
                unique.add(parsed.href);
                if (unique.size >= 500) break;
            } catch { /* discard malformed image URLs */ }
        }
        const pages = [...unique].sort((a, b) => { const n = u => Number(new URL(u).pathname.match(/\/(\d+)\.[^.]+$/)?.[1]); return n(a) - n(b); });
        // Reject incomplete scripts / placeholder image sets.
        return pages.length >= 3 ? filterPages(pages) : [];
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
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
            // Opt-in live test first; the standard reader keeps using the archive.
            if (req.query.live === '1') {
                const pages = await resolveLivePages(seriesSlug(seriesId), chapterId);
                if (pages.length) {
                    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
                    return res.status(200).json({ pages, source: 'live' });
                }
            }
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
            return res.status(200).json({ pages, source: 'supabase' });
        }

        // ── Chapter list for a series ─────────────────────────────────────────
        const { data, error } = await supabase
            .from('chapters')
            .select('chapter_id')
            .eq('series_id', seriesId);

        // The archive must remain fully functional if the upstream website
        // is temporarily unavailable. Do not fail the request on DB errors
        // when the live directory is reachable.
        const archived = (data || []).map(row => ({
            id: row.chapter_id,
            title: `Chapter ${row.chapter_id}`,
            number: parseFloat(row.chapter_id) || 0,
        }));
        const slug = seriesSlug(seriesId);
        const live = slug && req.query.live === '1' ? await fetchLiveChapters(slug) : [];
        // In opt-in live mode expose the union. New chapters can be loaded
        // through the live page resolver, while archived entries remain intact.
        const chapterMap = new Map(archived.map(ch => [String(ch.id), ch]));
        for (const ch of live) {
            if (!chapterMap.has(String(ch.id))) chapterMap.set(String(ch.id), ch);
        }
        const chapters = [...chapterMap.values()].sort((a, b) => a.number - b.number);
        if (error && !chapters.length) throw error;
        if (!chapters.length) {
            return res.status(404).json({ error: `Series not found: ${seriesId}`, chapters: [], total: 0 });
        }
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
        return res.status(200).json({
            chapters, total: chapters.length,
            liveLatestChapter: live.length ? live.reduce((a,b) => a.number > b.number ? a : b).id : null,
            liveChapterCount: live.length,
            archivedChapterCount: chapters.length,
        });

    } catch (e) {
        console.error('mgeko-chapters error:', e.message);
        return res.status(500).json({ error: 'Internal server error', detail: e.message });
    }
}