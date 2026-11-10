import { getMangapillManga, searchMangapill, mangapillChapterNumber } from '../manga_api/mangapill';
import { searchMgeko } from '../manga_api/mgeko';
import { searchHardcodedManhwa } from '../manga_api/hardcodedManhwas';
import { normalizedTitle, findMangapillMatch } from './mangapillMatch';

const CHAPTERS_API = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');
const SOURCE_NAMES = { mangapill: 'MangaPill', mgeko: 'Mgeko', asura: 'Asura Scans' };

// Previously verified cross-source associations. Dynamic provider searches
// extend these without creating guessed/fuzzy mappings.
const VERIFIED_EXTRA_SOURCES = {
    'ane no tomodachi': [{ source: 'mgeko', id: 'mgeko__ane-no-tomodachi' }],
    'fuufu ijou koibito miman': [{ source: 'mgeko', id: 'mgeko__fuufu-ijou-koibito-miman' }],
};

export const sourcePreferenceKey = title => 'mangako:preferred-source:' + normalizedTitle(title);
export const sourceSelectionKey = title => 'mangako:preferred-selection:' + normalizedTitle(title);
export const seriesMetadataKey = title => 'mangako:series-metadata:' + normalizedTitle(title);

export function sourceStorageKey(item) {
    if (!item?.id) return '';
    if (item.source === 'mangapill' && String(item.id).includes('mangapill.com')) {
        const path = String(item.id).split('/').filter(Boolean);
        const index = path.indexOf('manga');
        return index >= 0 ? path.slice(index + 1).join('__') : item.id;
    }
    return item.id;
}

// Explicitly recognized official/English title variants for the same work.
// This is intentionally conservative: fuzzy text similarity can match
// different manga and corrupt cross-source recommendations.
const TITLE_ALIASES = {
    'more than a married couple but not lovers': 'fuufu ijou koibito miman',
    'fuufu ijou koibito miman': 'fuufu ijou koibito miman',
};
const canonicalName = name => {
    const n = normalizedTitle(name);
    return TITLE_ALIASES[n] || n;
};
const sameWork = (a, b) => canonicalName(a) === canonicalName(b) && !!canonicalName(a);
const identity = item => item.source + ':' + item.id;

function curatedMatches(title) {
    return searchHardcodedManhwa('').filter(item =>
        (item.source === 'mgeko' || item.source === 'asura') && sameWork(item.title, title)
    );
}

export function highestChapterNumber(chapters, source) {
    const values = (chapters || []).map(ch => {
        if (source === 'mangapill') return mangapillChapterNumber(ch);
        if (Number.isFinite(ch?.number)) return ch.number;
        if (Number.isFinite(Number(ch?.id)) && String(ch?.id || '').trim()) return Number(ch.id);
        const label = String(ch?.title || ch?.name || ch?.id || '');
        const match = label.match(/(?:^|\b)(?:chapter|ch\.?)[\s:#._-]*(\d+(?:\.\d+)?)/i);
        return match ? Number(match[1]) : null;
    }).filter(n => n !== null && Number.isFinite(n));
    return values.length ? Math.max(...values) : null;
}
export function compareChapterCoverage(a, b) {
    const an = a.latestNumber, bn = b.latestNumber;
    if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
    if (Number.isFinite(an)) return -1;
    if (Number.isFinite(bn)) return 1;
    return (b.count || 0) - (a.count || 0);
}
async function chapterCoverageFor(item) {
    if (item.source === 'mangapill') {
        const result = await getMangapillManga(item.id);
        if (!sameWork(result.title, item.title)) return null;
        const chapters = Array.isArray(result.chapters) ? result.chapters : [];
        return { count: chapters.length, latestNumber: highestChapterNumber(chapters, 'mangapill') };
    }
    if (!CHAPTERS_API) return null;
    const endpoint = item.source === 'mgeko' ? 'mgeko-chapters' : 'asura-chapters';
    const params = new URLSearchParams({ seriesId: item.id });
    if (item.source === 'mgeko') params.set('live', '1');
    const res = await fetch(CHAPTERS_API + '/api/' + endpoint + '?' + params.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    return { count: chapters.length, latestNumber: highestChapterNumber(chapters, item.source) };
}

export async function discoverReadingSources({ title, currentSource, currentId, currentCount }) {
    const name = String(title || '').trim();
    if (!name || !currentId) return [];
    const current = { source: currentSource, id: currentId, title: name,
        count: currentCount, label: SOURCE_NAMES[currentSource] || currentSource };
    const candidates = [current, ...curatedMatches(name), ...(VERIFIED_EXTRA_SOURCES[canonicalName(name)] || [])];

    // Mgeko discovery is no longer restricted to hardcodedManhwas. Never
    // associate ambiguous results: only one distinct exact-title hit qualifies.
    const [mgekoSearch, mangapillSearch] = await Promise.allSettled([
        searchMgeko(name, 40),
        currentSource === 'mangapill' ? Promise.resolve([]) : findMangapillMatch(name, searchMangapill),
    ]);
    if (mgekoSearch.status === 'fulfilled' && Array.isArray(mgekoSearch.value)) {
        const matches = [...new Map(mgekoSearch.value
            .filter(item => item.id?.startsWith('mgeko__') && sameWork(item.title, name))
            .map(item => [item.id, item])).values()];
        if (matches.length === 1) candidates.push({ ...matches[0], title: name });
    }
    if (mangapillSearch.status === 'fulfilled' && mangapillSearch.value) {
        const hit = mangapillSearch.value;
        candidates.push({ id: hit.url, source: 'mangapill', title: name });
    }

    // A title can only have one automatically matched series per provider.
    // Explicit legacy mappings beat a differently named upstream URL.
    const unique = [...new Map(candidates.filter(i => i.id && i.source)
        .map(i => [identity(i), { ...i, title: name, label: SOURCE_NAMES[i.source] || i.source }])).values()];
    const choices = [current];
    for (const provider of ['mgeko', 'asura', 'mangapill']) {
        if (provider === currentSource) continue;
        const options = unique.filter(i => i.source === provider);
        if (options.length !== 1) continue;
        try {
            const coverage = await chapterCoverageFor(options[0]);
            if (coverage?.count > 0) choices.push({ ...options[0], ...coverage });
        } catch { /* Preserve working choices during provider outages */ }
    }
    return choices;
}

export function sourceDetailPath(item, title) {
    const text = encodeURIComponent(title);
    if (item.source === 'mangapill') {
        return '/MangaDetails?mangapillUrl=' + encodeURIComponent(item.id)
            + '&source=mangapill&title=' + text + '&sourceChoice=1';
    }
    return '/MangaDetails?seriesId=' + encodeURIComponent(item.id)
        + '&source=' + item.source + '&title=' + text + '&sourceChoice=1';
}
