import { searchWeebcentral, getWeebcentralManga, getWeebcentralChapterPages } from "./weebcentral";
import { searchMangaDex, getMangaDexDetails, normalizeMangaDex } from "./mangadex";
import { mergeManga } from "../services/mangaMerge";

export async function searchManga(source, query) {
    if (source === "weebcentral") return searchWeebcentral(query);
    if (source === "mangadex")    return searchMangaDex(query);
    throw new Error(`Unknown source: ${source}`);
}

export async function getMangaDetailsMerged(weebcentralIdOrUrl, mangadexId) {
    const [wc, mdRaw] = await Promise.all([
        getWeebcentralManga(weebcentralIdOrUrl),
        getMangaDexDetails(mangadexId),
    ]);
    const md = mdRaw ? normalizeMangaDex(mdRaw) : null;
    return mergeManga(md, wc);
}

export async function getChapterPages(source, chapterIdOrUrl) {
    if (source === "weebcentral") return getWeebcentralChapterPages(chapterIdOrUrl);
    throw new Error(`Unknown source: ${source}`);
}
