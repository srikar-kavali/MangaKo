import axios from 'axios';

const BASE = process.env.EXPO_PUBLIC_API;

// remove trailing slash if present
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
export const searchManga = async (query) => {
    try {
        const res = await axios.get(`${API_BASE}/asura/search`, {
            params: { query },
        });
        console.log("Search response:", res.data);
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching Asura search:", error.message);
        return [];
    }
};

// Get full manga info
export const getMangaInfo = async (id) => {
    try {
        const res = await axios.get(`${API_BASE}/asura/info/${id}`);
        console.log("Info response:", res.data);
        return res.data.results || {};
    } catch (error) {
        console.error("Error fetching Asura manga info:", error.message);
        return {};
    }
};

// Get chapter pages
export const getChapterPages = async (id, chapterId) => {
    try {
        const res = await axios.get(`${API_BASE}/asura/read/${id}/${chapterId}`);
        console.log("Pages response:", res.data);
        return res.data.results || [];
    } catch (error) {
        console.error("Error fetching Asura chapter pages:", error.message);
        return [];
    }
};
