import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = 'recentSearches';

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
