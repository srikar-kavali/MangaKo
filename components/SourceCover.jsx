import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import { proxied as proxiedMangapill, unwrapImageProxyUrl } from '../manga_api/mangapill';

const BACKEND = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');
const metadataCache = new Map();
const metadataPending = new Map();

// Preserve stable provider URLs; never send a failed Worker image through Vercel.
export function coverSources(...groups) {
    const values = groups.flat(Infinity);
    const seen = new Set();
    return values.map(raw => unwrapImageProxyUrl(raw))
        .filter(url => {
            if (typeof url !== 'string' || !/^https:\/\//i.test(url) || seen.has(url)) return false;
            seen.add(url);
            return true;
        });
}

async function liveMgekoCover(seriesId) {
    if (!seriesId || !String(seriesId).startsWith('mgeko__') || !BACKEND) return null;
    if (metadataCache.has(seriesId)) return metadataCache.get(seriesId);
    if (metadataPending.has(seriesId)) return metadataPending.get(seriesId);
    const job = (async () => {
        try {
            const response = await fetch(
                BACKEND + '/api/mgeko-chapters?seriesId=' + encodeURIComponent(seriesId) + '&metadata=1'
            );
            if (!response.ok) return null;
            const json = await response.json();
            const cover = json?.metadata?.cover;
            return coverSources(cover)[0] || null;
        } catch {
            return null;
        }
    })();
    metadataPending.set(seriesId, job);
    const result = await job;
    metadataPending.delete(seriesId);
    if (metadataCache.size > 400) metadataCache.clear();
    metadataCache.set(seriesId, result);
    return result;
}

export default function SourceCover({
    urls = [], seriesId, source, style, resizeMode = 'cover', placeholder = null, ...imageProps
}) {
    const key = JSON.stringify(urls);
    const originals = useMemo(() => coverSources(urls), [key]);
    const [freshCover, setFreshCover] = useState(null);
    const candidates = useMemo(() => {
        const items = coverSources(originals, freshCover);
        const rendered = [];
        const seen = new Set();
        for (const url of items) {
            let host = '';
            try { host = new URL(url).hostname; } catch { continue; }
            // MangaDex supports resized covers (256/512) and their original
            // artwork. A missing thumbnail must not blank the whole card.
            // Use the public CDN first; the Worker is a bounded fallback.
            const isMangadexCover = host === 'uploads.mangadex.org' && url.includes('/covers/');
            const variants = isMangadexCover ? [url] : [];
            if (isMangadexCover) {
                const original = url.replace(/\.(?:256|512)\.jpg(?=\?|$)/i, '');
                if (original !== url) {
                    variants.push(original, original + '.512.jpg');
                }
            }
            const choices = isMangadexCover
                ? [...variants, proxiedMangapill(url)]
                : [proxiedMangapill(url)];
            for (const candidate of choices) {
                if (candidate && !seen.has(candidate)) {
                    seen.add(candidate);
                    rendered.push(candidate);
                }
            }
        }
        return rendered;
    }, [originals, freshCover]);
    const [index, setIndex] = useState(0);
    useEffect(() => { setIndex(0); setFreshCover(null); }, [key, seriesId]);
    useEffect(() => {
        if (index < candidates.length || source !== 'mgeko' || freshCover || !seriesId) return;
        let active = true;
        liveMgekoCover(seriesId).then(url => {
            if (active && url && !originals.includes(url)) setFreshCover(url);
        });
        return () => { active = false; };
    }, [index, candidates.length, source, freshCover, seriesId, originals]);
    const uri = candidates[index];
    return uri
        ? <Image {...imageProps} source={{ uri, cache: 'force-cache' }} style={style} resizeMode={resizeMode}
                 onError={() => setIndex(current => current + 1)} />
        : placeholder;
}
