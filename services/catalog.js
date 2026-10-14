import { searchHardcodedManhwa } from '../manga_api/hardcodedManhwas';
import { searchMangadex } from '../manga_api/mangadex';

export function normalizeCatalogItem(item, source) {
    const id = item?.id || item?.url;
    if (!id || !item?.title) return null;
    return {
        ...item,
        id,
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

// MangaDex drives live discovery; existing curated manhwa remains available.
// MangaPill search and chapter reading are intentionally unaffected.
export async function discoverCatalog({ offset = 0, limit = 24, language = '' } = {}) {
    const curated = offset === 0 ? searchHardcodedManhwa('') : [];
    try {
        const remote = await searchMangadex('', limit, offset, language);
        return mergeCatalogItems(curated, remote);
    } catch (error) {
        console.warn('MangaDex discovery failed:', error);
        if (curated.length) return mergeCatalogItems(curated);
        throw error;
    }
}
