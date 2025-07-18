export const searchManga = async (title) => {
    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=10&translatedLanguage[]=en`;

    const response = await fetch(url);
    const json = await response.json();
    return json.data;
};

export const getMangaDetails = async (id) => {
    const url = `https://api.mangadex.org/manga/${id}`;

    const response = await fetch(url);
    const json = await response.json();
    return json.data;
};

export const getChapters = async (id) => {
    const url = `https://api.mangadex.org/chapter?manga=${id}&translatedLanguage[]=en&order[chapter]=asc&limit=100`;

    const response = await fetch(url);
    const json = await response.json();
    return json.data;
};

export const getChapterPages = async (chapterId) => {
    const url = `https://api.mangadex.org/at-home/server/${chapterId}`;

    const response = await fetch(url);
    const json = await response.json();
    return json.data;
}

export function getCoverImages(mangaId, filename) {
    return `https://uploads.mangadex.org/covers/${mangaId}/${filename}`;
}