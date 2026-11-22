import { manhwas } from '../manga_api/hardcodedManhwas.js';
import { getCoverUrl } from './coverurls.js';
import { canonicalSeriesTitle } from './seriesIdentity.js';

// One stable series overview for verified multi-provider titles. Provider
// records remain intact for chapter retrieval and reading-progress storage.
export function canonicalMetadataFor(title) {
    const name = canonicalSeriesTitle(title);
    if (!name) return null;
    const entries = manhwas.filter(item => canonicalSeriesTitle(item.title) === name);
    if (new Set(entries.map(item => item.source)).size < 2) return null;
    const preferred = entries.find(item => item.source === 'asura') || entries[0];
    return {
        title: preferred.title,
        description: preferred.description || '',
        cover: getCoverUrl(preferred.id) || preferred.cover || preferred.coverUrl || '',
        genres: Array.isArray(preferred.genres) ? preferred.genres : [],
        status: preferred.status || '',
    };
}

export function applyCanonicalMetadata(item) {
    const meta = canonicalMetadataFor(item?.title);
    if (!meta) return item;
    return {
        ...item,
        title: meta.title,
        description: meta.description || item.description,
        cover: meta.cover || item.cover,
        coverUrl: meta.cover || item.coverUrl,
        image: meta.cover || item.image,
        genres: meta.genres.length ? meta.genres : item.genres,
        status: meta.status || item.status,
    };
}
