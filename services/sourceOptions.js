import { getMangapillManga, searchMangapill } from '../manga_api/mangapill';
import { searchHardcodedManhwa } from '../manga_api/hardcodedManhwas';
import { normalizedTitle, findMangapillMatch } from './mangapillMatch';

const CHAPTERS_API = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');
const SOURCE_NAMES = { mangapill: 'MangaPill', mgeko: 'Mgeko', asura: 'Asura Scans' };

export const sourcePreferenceKey = title => 'mangako:preferred-source:' + normalizedTitle(title);

function curatedMatches(title) {
    const target = normalizedTitle(title);
    if (!target) return [];
    return searchHardcodedManhwa('').filter(item =>
        (item.source === 'mgeko' || item.source === 'asura')
        && normalizedTitle(item.title) === target
    );
}

function identity(item) {
    return item.source + ':' + item.id;
}

async function chapterCountFor(item) {
    if (item.source === 'mangapill') {
        const manga = await getMangapillManga(item.id);
        if (normalizedTitle(manga.title) !== normalizedTitle(item.title)) return null;
        return Array.isArray(manga.chapters) ? manga.chapters.length : null;
    }
    if (!CHAPTERS_API) return null;
    const endpoint = item.source === 'mgeko' ? 'mgeko-chapters' : 'asura-chapters';
    const query = new URLSearchParams({ seriesId: item.id });
    if (item.source === 'mgeko') query.set('live', '1');
    const response = await fetch(CHAPTERS_API + '/api/' + endpoint + '?' + query.toString());
    if (!response.ok) return null;
    const json = await response.json();
    return Array.isArray(json.chapters) ? json.chapters.length : null;
}

// Match only exact, unique titles and validate chapter availability.
// Source-specific reading history remains in its original storage key.
export async function discoverReadingSources({ title, currentSource, currentId, currentCount }) {
    const name = String(title || '').trim();
    if (!name || !currentId) return [];
    const current = { source: currentSource, id: currentId, title: name,
        count: currentCount, label: SOURCE_NAMES[currentSource] || currentSource };
    const options = [current];
    const matches = curatedMatches(name);
    for (const provider of ['mgeko', 'asura']) {
        const same = matches.filter(item => item.source === provider);
        if (same.length === 1) {
            options.push({ source: provider, id: same[0].id, title: name, label: SOURCE_NAMES[provider] });
        }
    }
    if (currentSource !== 'mangapill') {
        try {
            const hit = await findMangapillMatch(name, searchMangapill);
            if (hit) options.push({ source: 'mangapill', id: hit.url, title: name, label: 'MangaPill' });
        } catch { /* No alternative if search is unavailable */ }
    }
    const unique = [...new Map(options.map(item => [identity(item), item])).values()];
    const checked = await Promise.all(unique.map(async item => {
        if (identity(item) === identity(current)) return current;
        try {
            const count = await chapterCountFor(item);
            return count != null && count > 0 ? { ...item, count } : null;
        } catch { return null; }
    }));
    return checked.filter(Boolean);
}

export function sourceDetailPath(item, title) {
    const label = encodeURIComponent(title);
    if (item.source === 'mangapill') {
        return '/MangaDetails?mangapillUrl=' + encodeURIComponent(item.id)
            + '&source=mangapill&title=' + label + '&sourceChoice=1';
    }
    return '/MangaDetails?seriesId=' + encodeURIComponent(item.id)
        + '&source=' + item.source + '&title=' + label + '&sourceChoice=1';
}
