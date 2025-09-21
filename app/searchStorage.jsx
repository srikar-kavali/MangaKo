import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'recentSearches';
const FAVORITES_KEY = 'favorites';
const LAST_READ_KEY = 'lastReadChapters';
const COMPLETED_KEY = 'completed_manga';

// --- Recent Searches ---
export async function getRecentSearches() {
    try {
        const json = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        return json != null ? JSON.parse(json) : [];
    } catch (e) {
        console.error('Failed to load recent searches', e);
        return [];
    }
}

export async function saveRecentSearches(searches) {
    try {
        const json = JSON.stringify(searches);
        await AsyncStorage.setItem(RECENT_SEARCHES_KEY, json);
    } catch (e) {
        console.error('Failed to save recent searches', e);
    }
}

// --- Favorites ---
export async function getFavorites() {
    try {
        const json = await AsyncStorage.getItem(FAVORITES_KEY);
        return json != null ? JSON.parse(json) : [];
    } catch (e) {
        console.error('Failed to load favorites', e);
        return [];
    }
}

export async function addFavorite(manga) {
    try {
        const stored = await AsyncStorage.getItem(FAVORITES_KEY);
        const list = stored ? JSON.parse(stored) : [];

        if (!list.find(item => item.url === manga.url)) {
            list.push({
                url: manga.url,
                title: manga.title || "Unknown",
                coverUrl: manga.coverUrl || "",
                description: manga.description || "",
                addedAt: Date.now(),
            });
            await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
        }
    } catch (e) {
        console.error('Failed to add favorite', e);
    }
}

export async function removeFavorite(mangaUrl) {
    try {
        const list = await getFavorites();
        const updated = list.filter(item => item.url !== mangaUrl);
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));

        // Also remove last read data for this manga
        await removeLastReadChapter(mangaUrl);
    } catch (e) {
        console.error('Failed to remove favorite', e);
    }
}

// --- Last Read Chapter ---
export async function saveLastReadChapter(mangaUrl, chapterUrl) {
    try {
        const lastReadData = await AsyncStorage.getItem(LAST_READ_KEY);
        const lastRead = lastReadData ? JSON.parse(lastReadData) : {};

        lastRead[mangaUrl] = {
            chapterUrl,
            timestamp: Date.now(),
        };

        await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead));
    } catch (e) {
        console.error('Failed to save last read chapter', e);
    }
}

export async function getLastReadChapter(mangaUrl) {
    try {
        const lastReadData = await AsyncStorage.getItem(LAST_READ_KEY);
        if (!lastReadData) return null;

        const lastRead = JSON.parse(lastReadData);
        return lastRead[mangaUrl]?.chapterUrl || null;
    } catch (e) {
        console.error('Failed to get last read chapter', e);
        return null;
    }
}

export async function removeLastReadChapter(mangaUrl) {
    try {
        const lastReadData = await AsyncStorage.getItem(LAST_READ_KEY);
        if (!lastReadData) return;

        const lastRead = JSON.parse(lastReadData);
        delete lastRead[mangaUrl];

        await AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead));
    } catch (e) {
        console.error('Failed to remove last read chapter', e);
    }
}

export async function getLastReadChapterInfo(mangaUrl) {
    try {
        const lastReadData = await AsyncStorage.getItem(LAST_READ_KEY);
        if (!lastReadData) return null;

        const lastRead = JSON.parse(lastReadData);
        return lastRead[mangaUrl] || null;
    } catch (e) {
        console.error('Failed to get last read chapter info', e);
        return null;
    }
}

// --- Mark as Completed ---
export async function markCompleted(id) {
    try {
        const data = await AsyncStorage.getItem(COMPLETED_KEY);
        const list = data ? JSON.parse(data) : [];
        if (!list.includes(id)) {
            list.push(id);
            await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(list));
        }
    } catch (err) {
        console.error("Failed to mark completed", err);
    }
}

export async function unmarkCompleted(id) {
    try {
        const data = await AsyncStorage.getItem(COMPLETED_KEY);
        const list = data ? JSON.parse(data) : [];
        const newList = list.filter(x => x !== id);
        await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(newList));
    } catch (err) {
        console.error("Failed to unmark completed", err);
    }
}

export async function getCompleted() {
    try {
        const data = await AsyncStorage.getItem(COMPLETED_KEY);
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error("Failed to load completed", err);
        return [];
    }
}

export async function saveFavorites(favs) {
    try {
        const json = JSON.stringify(favs);
        await AsyncStorage.setItem(FAVORITES_KEY, json);
    } catch (e) {
        console.error('Failed to save favorites', e);
    }
}

// Legacy wrappers
export const setLastReadChapter = saveLastReadChapter;
export const updateLastRead = saveLastReadChapter;
export const getLastRead = getLastReadChapter;
