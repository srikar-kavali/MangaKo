const BASE_URL = "https://api.mangadex.org";

// Content ratings to allow all types (including erotica/hentai if needed)
const CONTENT_RATINGS = [
    "safe",
    "suggestive",
    "erotica",
    "pornographic"
];

export const searchManga = async (title) => {
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

export const getMangaDetails = async (mangaId) => {
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

export const getChapters = async (mangaId, offset = 0, limit = 100) => {
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

export const getChapterPages = async (chapterId) => {
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
