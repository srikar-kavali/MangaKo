import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Image, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { getRecentSearches, saveRecentSearches } from '../searchStorage';
import { searchMangapill, proxied } from '../../manga_api/mangapill';

const LIVE_DELAY_MS = 120;   // snappy live search

// --- helper: derive human-readable title from url if API says "Unknown"
function deriveTitleFromUrl(url = '') {
    try {
        const parts = String(url).split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        const decoded = decodeURIComponent(last);
        const spaced = decoded.replace(/[-_]+/g, ' ').trim();
        return spaced.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1)) || 'Unknown';
    } catch {
        return 'Unknown';
    }
}

const Home = () => {
    const [searchActive, setSearchActive] = useState(false);
    const [query, setQuery] = useState('');
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    const router = useRouter();

    // simple in-memory cache for live feel
    const cacheRef = useRef(new Map()); // key: qLower, value: results[]
    const timerRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        (async () => setRecentSearches(await getRecentSearches()))();
    }, []);

    // smart/live search
    useEffect(() => {
        const q = query.trim();
        const qLower = q.toLowerCase();

        if (!q) {
            setSearchResults([]);
            setIsSearching(false);
            if (abortRef.current) abortRef.current.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        // show cached results instantly
        if (cacheRef.current.has(qLower)) {
            setSearchResults(cacheRef.current.get(qLower));
        }

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setIsSearching(true);
            try {
                const raw = await searchMangapill(q, 15);
                const seen = new Set();
                const unique = [];
                for (const it of Array.isArray(raw) ? raw : []) {
                    const key = it?.url || it?.title || '';
                    if (!seen.has(key)) {
                        seen.add(key);
                        const displayTitle =
                            it?.title && it.title.toLowerCase() !== 'unknown'
                                ? it.title
                                : deriveTitleFromUrl(it?.url);
                        unique.push({ ...it, displayTitle });
                    }
                }
                if (!controller.signal.aborted) {
                    cacheRef.current.set(qLower, unique);
                    setSearchResults(unique);
                }
            } catch (e) {
                if (e?.name !== 'AbortError') console.log('Live search error', e);
                if (!controller.signal.aborted) setSearchResults([]);
            } finally {
                if (!controller.signal.aborted) setIsSearching(false);
            }
        }, LIVE_DELAY_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [query]);

    const handleAddSearch = async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const updated = [trimmed, ...recentSearches.filter((i) => i !== trimmed)].slice(0, 10);
        setRecentSearches(updated);
        await saveRecentSearches(updated);
    };

    const removeSearch = async (text) => {
        const updated = recentSearches.filter((i) => i !== text);
        setRecentSearches(updated);
        await saveRecentSearches(updated);
    };

    const openResult = (item) => {
        const mangapillUrl = item?.url || '';
        setSearchActive(false);
        router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(mangapillUrl)}`);
    };

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Pressable style={styles.logo} onPress={() => router.replace('/tabs/home')}>
                        <Image source={dragonLogo} style={styles.logoImage} />
                    </Pressable>
                    <Text style={styles.logoText}>Mangako</Text>
                </View>
                <Pressable onPress={() => { setSearchActive(true); setDropdownVisible(false); }}>
                    <Ionicons name='search-circle-outline' style={styles.icon} size={40} />
                </Pressable>
                <Pressable onPress={() => setDropdownVisible(!dropdownVisible)}>
                    <Ionicons name="person-circle-outline" size={40} style={styles.icon} />
                </Pressable>
            </View>

            {dropdownVisible && (
                <>
                    <View style={styles.triangle} />
                    <View style={styles.dropdown}>
                        <Pressable onPress={() => { setDropdownVisible(false); router.push('/settings'); }}>
                            <Text style={styles.dropdownItem}>Settings</Text>
                        </Pressable>
                        <Pressable onPress={async () => { setDropdownVisible(false); await signOut(); router.replace('/login'); }}>
                            <Text style={styles.dropdownItem}>Sign Out</Text>
                        </Pressable>
                    </View>
                </>
            )}

            <View style={styles.borderLine} />

            {searchActive && (
                <View style={styles.searchOverlay}>
                    <SafeAreaView style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#aaa" style={styles.searchIcon} />
                            <TextInput
                                placeholder="Search"
                                placeholderTextColor="#aaa"
                                style={styles.input}
                                value={query}
                                onChangeText={setQuery}
                                autoFocus
                                returnKeyType="search"
                                onSubmitEditing={async () => {
                                    const q = query.trim();
                                    if (!q) return;
                                    await handleAddSearch(q);
                                }}
                            />
                            {isSearching ? (
                                <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                            ) : null}
                            <Pressable onPress={() => setSearchActive(false)}>
                                <Text style={styles.cancel}>Cancel</Text>
                            </Pressable>
                        </View>

                        <FlatList
                            data={recentSearches}
                            keyExtractor={(item, idx) => `${item}-${idx}`}
                            renderItem={({ item }) => (
                                <View style={styles.historyRow}>
                                    <View style={styles.historyLeft}>
                                        <Ionicons name="time-outline" size={20} color="#aaa" />
                                        <Text style={styles.historyText}>{item}</Text>
                                    </View>
                                    <Pressable onPress={() => removeSearch(item)}>
                                        <Ionicons name="close-outline" size={18} color="#aaa" />
                                    </Pressable>
                                </View>
                            )}
                        />

                        {query.trim().length > 0 && searchResults.length === 0 && !isSearching ? (
                            <Text style={{ padding: 16, color: '#666' }}>No results.</Text>
                        ) : null}

                        {searchResults.length > 0 && (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item, idx) => item?.url ? `${item.url}::${idx}` : `${item?.displayTitle || 'item'}::${idx}`}
                                renderItem={({ item }) => {
                                    const title = item?.displayTitle || 'Unknown';
                                    const cover = item?.cover ? proxied(item.cover) : null;
                                    return (
                                        <Pressable onPress={() => openResult(item)} style={rowStyles.itemRow}>
                                            {cover ? (
                                                <Image source={{ uri: cover }} style={rowStyles.itemCover} />
                                            ) : (
                                                <View style={rowStyles.itemCoverFallback} />
                                            )}
                                            <Text style={rowStyles.itemTitle} numberOfLines={1} ellipsizeMode="tail">
                                                {title}
                                            </Text>
                                        </Pressable>
                                    );
                                }}
                                ItemSeparatorComponent={() => <View style={rowStyles.separator} />}
                                keyboardShouldPersistTaps="handled"
                            />
                        )}
                    </SafeAreaView>
                </View>
            )}
        </SafeAreaView>
    );
};

export default Home;

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 1 },
    logoLeft: { flexDirection: 'row', alignItems: 'center' },
    logoImage: { width: 50, height: 50, resizeMode: 'contain', marginRight: 8 },
    logoText: { fontSize: 20, fontWeight: 'bold', color: '#1E1E1E' },
    icon: { color: '#333' },
    triangle: { position: 'absolute', top: 115, right: 28, width: 12, height: 12, backgroundColor: '#fff', transform: [{ rotate: '45deg' }], borderTopColor: '#ccc', borderLeftColor: '#ccc', borderTopWidth: 1, borderLeftWidth: 1, zIndex: 101 },
    dropdown: { position: 'absolute', top: 120, right: 16, backgroundColor: '#fff', borderColor: '#ccc', borderWidth: 1, borderRadius: 6, paddingVertical: 8, zIndex: 99, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
    dropdownItem: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 16, color: '#333' },
    borderLine: { height: 1, backgroundColor: '#ccc', width: '100%' },
    searchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 999, elevation: 10 },
    searchContainer: { flex: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#f1f1f1', borderRadius: 10, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, color: '#000' },
    cancel: { color: '#007AFF', marginLeft: 10 },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: '#eee', borderBottomWidth: 1 },
    historyLeft: { flexDirection: 'row', alignItems: 'center' },
    historyText: { color: '#333', fontSize: 16, marginLeft: 8 },
});

const rowStyles = StyleSheet.create({
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
    itemCover: { width: 42, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: '#eee' },
    itemCoverFallback: { width: 42, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: '#eee' },
    itemTitle: { flex: 1, fontSize: 16, color: '#000' },
    separator: { height: 1, backgroundColor: '#eee', marginLeft: 12 },
});
