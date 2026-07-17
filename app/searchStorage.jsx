import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'recentSearches';
const FAVORITES_KEY = 'favorites';
const LAST_READ_KEY = 'lastReadChapters';
const COMPLETED_KEY = 'completed_manga';

const NEW_CHAPTER_PREFIX = 'newchapter:';
export const newChapterKey = (mangaUrl) => `${NEW_CHAPTER_PREFIX}${mangaUrl}`;

export async function clearNewChapterFlag(mangaUrl) {
    try {
        await AsyncStorage.removeItem(newChapterKey(mangaUrl));
    } catch (e) {
        console.error('Failed to clear new chapter flag', e);
    }
}

const LAST_VIEWED_PREFIX = 'lastviewed:';

export async function touchLastViewed(mangaUrl) {
    try {
        await AsyncStorage.setItem(`${LAST_VIEWED_PREFIX}${mangaUrl}`, String(Date.now()));
    } catch (e) {
        console.error('Failed to touch last viewed', e);
    }
}

export async function getLastViewed(mangaUrl) {
    try {
        const v = await AsyncStorage.getItem(`${LAST_VIEWED_PREFIX}${mangaUrl}`);
        return v ? parseInt(v, 10) : null;
    } catch (e) {
        return null;
    }
}

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
        await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
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

        const existing = list.findIndex(item => item.url === manga.url);
        const entry = {
            url: manga.url,
            title: manga.title || 'Unknown',
            coverUrl: manga.coverUrl || manga.cover || '',
            cover: manga.cover || manga.coverUrl || '',
            description: manga.description || '',
            // ── FIX: persist source so home.jsx getSource() always has it ──
            source: manga.source || '',
            addedAt: existing >= 0 ? list[existing].addedAt : Date.now(),
        };

        if (existing >= 0) {
            list[existing] = entry; // update in place
        } else {
            list.push(entry);
        }

        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('Failed to add favorite', e);
    }
}

export async function removeFavorite(mangaUrl) {
    try {
        const list = await getFavorites();
        const updated = list.filter(item => item.url !== mangaUrl);
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));

        // ── FIX: do NOT delete lastReadChapters on unfollow ──────────────────
        // Previously this wiped read progress when a user unfollowed and
        // re-followed a series, causing MangaDetails to show "Start Reading"
        // and losing chapter position. Read progress is cheap to keep and
        // should survive a status change. Only wipe if the user explicitly
        // clears their history (a separate future action).
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
        console.error('Failed to mark completed', err);
    }
}

export async function unmarkCompleted(id) {
    try {
        const data = await AsyncStorage.getItem(COMPLETED_KEY);
        const list = data ? JSON.parse(data) : [];
        await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(list.filter(x => x !== id)));
    } catch (err) {
        console.error('Failed to unmark completed', err);
    }
}

export async function getCompleted() {
    try {
        const data = await AsyncStorage.getItem(COMPLETED_KEY);
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error('Failed to load completed', err);
        return [];
    }
}

export async function saveFavorites(favs) {
    try {
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    } catch (e) {
        console.error('Failed to save favorites', e);
    }
}

export const saveLatestChapter = async (mangaUrl, chapterNumber) => {
    try {
        await AsyncStorage.setItem(`latest_chapter_${mangaUrl}`, String(chapterNumber));
    } catch (error) {
        console.error('Failed to save latest chapter:', error);
    }
};

export const getLatestChapter = async (mangaUrl) => {
    try {
        const value = await AsyncStorage.getItem(`latest_chapter_${mangaUrl}`);
        return value ?? null; // return raw string — callers handle parsing
    } catch (error) {
        return null;
    }
};

// Legacy wrappers
export const setLastReadChapter = saveLastReadChapter;
export const updateLastRead = saveLastReadChapter;
export const getLastRead = getLastReadChapter;