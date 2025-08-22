import { searchMangapill, getMangapillManga, getMangapillChapterPages,} from "./mangapill";
import { searchMangaDex, getMangaDexDetails, normalizeMangaDex,} from "./mangadex";
import { mergeManga } from "../services/mangaMerge";

export async function searchManga(source, query, limit = 20) {
    if (source === "weebcentral") {
        console.warn('[mangaAPI] "weebcentral" is deprecated; routing to "mangapill".');
        source = "mangapill";
    }

    if (source === "mangapill") return searchMangapill(query, limit);
    if (source === "mangadex")  return searchMangaDex(query);

    throw new Error(`Unknown source: ${source}`);
}

export async function getMangaDetailsMerged(mangapillIdOrUrl, mangadexId) {
    const [mp, mdRaw] = await Promise.all([
        getMangapillManga(mangapillIdOrUrl),
        getMangaDexDetails(mangadexId),
    ]);

    const md = mdRaw ? normalizeMangaDex(mdRaw) : null;
    return mergeManga(md, mp);
}

export async function getChapterPages(source, chapterIdOrUrl) {
    if (source === "weebcentral") {
        console.warn('[mangaAPI] "weebcentral" is deprecated; routing to "mangapill".');
        source = "mangapill";
    }

    if (source === "mangapill") return getMangapillChapterPages(chapterIdOrUrl);

    throw new Error(`Unknown source: ${source}`);
}
