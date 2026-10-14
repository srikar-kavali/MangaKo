import { searchHardcodedManhwa } from '../manga_api/hardcodedManhwas';
import { searchMangadex } from '../manga_api/mangadex';
import { browseMangapill } from '../manga_api/mangapill';

export function normalizeCatalogItem(item, source) {
    const id = item?.id || item?.url;
    if (!id || !item?.title) return null;
    return {
        ...item, id,
        source: source || item.source || 'asura',
        cover: item.cover || item.coverUrl || item.image || null,
        coverUrl: item.coverUrl || item.cover || item.image || null,
    };
}

export function mergeCatalogItems(...groups) {
    const unique = new Map();
    for (const item of groups.flat()) {
        const normalized = normalizeCatalogItem(item);
        if (!normalized) continue;
        const key = `${normalized.source}:${normalized.id}`;
        if (!unique.has(key)) unique.set(key, normalized);
    }
    return [...unique.values()];
}

// Fetches title metadata, not chapter images.
export async function discoverCatalog({ offset = 0, limit = 24, language = '' } = {}) {
    const curated = offset === 0 ? searchHardcodedManhwa('') : [];
    const sources = offset === 0
        ? [searchMangadex('', limit, offset, language), browseMangapill(limit)]
        : [searchMangadex('', limit, offset, language)];
    const responses = await Promise.allSettled(sources);
    const available = responses
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
    if (!available.length && responses.every(result => result.status === 'rejected')) {
        throw new Error('All remote catalog sources are unavailable');
    }
    return mergeCatalogItems(curated, available);
}
