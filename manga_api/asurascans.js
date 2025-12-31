import axios from 'axios';

const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API;

function cleanBase(base) {
    return base?.endsWith("/") ? base.slice(0, -1) : base;
}

const API_BASE = cleanBase(BASE);

export function proxied(src) {
    if (!src) return "";
    if (src.startsWith(API_BASE)) return src;
    return `${API_BASE}/image_proxy?url=${encodeURIComponent(src)}`;
}

// Search manga on AsuraScans
export const searchManga = async (query, page = 1) => {
    console.log("API_BASE:", API_BASE); // ← ADD THIS
    console.log("Full URL:", `${API_BASE}/api/asurascans/search?q=${query}`); // ← ADD THIS
    try {
        const res = await axios.get(`${API_BASE}/api/asurascans/search`, {
            params: { q: query, page },
        });
        console.log("Search response:", res.data);
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching Asura search:", error.message);
        console.error("Full error:", error); // ← ADD THIS
        return [];
    }
};

// Get full manga info
export const getMangaInfo = async (seriesId) => {
    try {
        const res = await axios.get(`${API_BASE}/api/asurascans/manga`, {
            params: { series_id: seriesId }
        });
        console.log("Info response:", res.data);
        return res.data.results || {};
    } catch (error) {
        console.error("Error fetching Asura manga info:", error.message);
        return {};
    }
};

// Get chapter pages
export const getChapterPages = async (seriesId, chapterId) => {
    try {
        const res = await axios.get(`${API_BASE}/api/asurascans/chapter_pages`, {
            params: {
                series_id: seriesId,
                chapter_id: chapterId
            }
        });
        console.log("Pages response:", res.data);
        // API returns {status, results} - extract results array
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching Asura chapter pages:", error.message);
        return [];
    }
};

// Get latest updates
export const getLatestManga = async (page = 1) => {
    try {
        const res = await axios.get(`${API_BASE}/api/asurascans/latest`, {
            params: { page }
        });
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching latest manga:", error.message);
        return [];
    }
};

// Get manga by genre
export const getMangaByGenre = async (genreSlug, page = 1) => {
    try {
        const res = await axios.get(`${API_BASE}/api/asurascans/genres/${genreSlug}`, {
            params: { page }
        });
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching manga by genre:", error.message);
        return [];
    }
};