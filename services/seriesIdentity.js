import { normalizedTitle } from './mangapillMatch.js';

// Only known alternative titles are linked. Do not fuzzy-merge similar titles.
const TITLE_ALIASES = {
    'more than a married couple but not lovers': 'fuufu ijou koibito miman',
    'fuufu ijou koibito miman': 'fuufu ijou koibito miman',
};

export function canonicalSeriesTitle(title) {
    const name = normalizedTitle(title);
    return TITLE_ALIASES[name] || name;
}

// Search results can contain multiple providers for one series. Keep each
// provider's ID attached to the result; never discard alternative chapters.
// If a provider returns multiple different series with the same title, avoid
// merging that ambiguous title altogether.
export function groupSearchResults(results) {
    const groups = new Map();
    for (const item of results || []) {
        if (!item?.title || !item?.source || !(item.id || item.url)) continue;
        const titleKey = canonicalSeriesTitle(item.title);
        if (!titleKey) continue;
        if (!groups.has(titleKey)) groups.set(titleKey, []);
        const entries = groups.get(titleKey);
        const id = String(item.id || item.url);
        if (!entries.some(old => old.source === item.source && String(old.id || old.url) === id)) {
            entries.push(item);
        }
    }

    const output = [];
    for (const entries of groups.values()) {
        const seenProviders = new Set();
        const ambiguous = entries.some(entry => {
            if (seenProviders.has(entry.source)) return true;
            seenProviders.add(entry.source);
            return false;
        });
        if (ambiguous) {
            output.push(...entries.map(entry => ({ ...entry, searchSources: [entry] })));
            continue;
        }
        // The highest-ranked match stays visible as the cover/title.
        const primary = entries[0];
        output.push({
            ...primary,
            searchSources: entries.map(entry => ({
                source: entry.source,
                id: entry.id || entry.url,
                title: entry.title,
                cover: entry.cover || entry.coverUrl || entry.image || null,
            })),
        });
    }
    return output.sort((a, b) => (b.score || 0) - (a.score || 0));
}
