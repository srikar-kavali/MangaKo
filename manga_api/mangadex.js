const BASE_URL = "https://api.mangadex.org";

// Content ratings to allow all types (including erotica/hentai if needed)
const CONTENT_RATINGS = [
    "safe",
    "suggestive",
    "erotica",
    "pornographic"
];

export const searchMangaDex = async (title) => {
    try {
        const params = new URLSearchParams();
        params.append("title", title);
        params.append("limit", "100");

        // Include cover art and authors
        params.append("includes[]", "cover_art");
        params.append("includes[]", "author");
        params.append("includes[]", "artist");

        // English only
        params.append("originalLanguage[]", "ja");
        params.append("availableTranslatedLanguage[]", "en");

        // Add all content ratings
        CONTENT_RATINGS.forEach(rating => {
            params.append("contentRating[]", rating);
        });

        const url = `${BASE_URL}/manga?${params.toString()}`;
        const response = await fetch(url);
        const json = await response.json();
        return json?.data || [];
    } catch (error) {
        console.error("❌ searchManga failed:", error);
        return [];
    }
};

export const getMangaDexDetails = async (mangaId) => {
    try {
        const url = `${BASE_URL}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
        const response = await fetch(url);
        const json = await response.json();
        return json?.data || null;
    } catch (error) {
        console.error("❌ getMangaDetails failed:", error);
        return null;
    }
};

export const getMangaDexChapters = async (mangaId, offset = 0, limit = 100) => {
    try {
        const params = new URLSearchParams();
        params.append("manga", mangaId);
        params.append("translatedLanguage[]", "en");
        params.append("limit", limit.toString());
        params.append("offset", offset.toString());
        params.append("order[chapter]", "desc");

        const url = `${BASE_URL}/chapter?${params.toString()}`;
        const response = await fetch(url);
        const json = await response.json();
        return json?.data || [];
    } catch (error) {
        console.error("❌ getChapters failed:", error);
        return [];
    }
};

export const getMangaDexChapterPages = async (chapterId) => {
    try {
        const url = `${BASE_URL}/at-home/server/${chapterId}`;
        const response = await fetch(url);
        const json = await response.json();
        const baseUrl = json?.baseUrl;
        const hash = json?.chapter?.hash;
        const data = json?.chapter?.data;

        if (!baseUrl || !hash || !data) return [];

        return data.map(filename => `${baseUrl}/data/${hash}/${filename}`);
    } catch (error) {
        console.error("❌ getChapterPages failed:", error);
        return [];
    }
};

// --- Helpers for clean MD data ---
function pickEn(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    return obj.en ?? Object.values(obj)[0] ?? "";
}

function buildCoverUrl(mangaId, fileName, size = 512) {
    if (!mangaId || !fileName) return null;
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.${size}.jpg`;
}

export function normalizeMangaDex(mdData) {
    if (!mdData) return null;
    const attrs = mdData.attributes || {};
    const title = pickEn(attrs.title);
    const description = pickEn(attrs.description);

    const relationships = Array.isArray(mdData.relationships) ? mdData.relationships : [];

    const authors = relationships
        .filter(r => r.type === "author")
        .map(r => r.attributes?.name)
        .filter(Boolean);

    const artists = relationships
        .filter(r => r.type === "artist")
        .map(r => r.attributes?.name)
        .filter(Boolean);

    const coverRel = relationships.find(r => r.type === "cover_art");
    const coverFile = coverRel?.attributes?.fileName;
    const coverUrl = buildCoverUrl(mdData.id, coverFile, 512);

    const tags = (attrs.tags || [])
        .map(t => pickEn(t.attributes?.name))
        .filter(Boolean);

    return {
        id: mdData.id,
        title,
        description,
        authors,
        artists,
        tags,
        coverUrl,
    };
}
