import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Image, Pressable, TextInput, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { getRecentSearches, saveRecentSearches } from '../searchStorage';
import { searchManga, proxied } from '../../manga_api/asurascans';
import FollowedUpdatesRow from '../FollowedUpdatesRow';

const LIVE_DELAY_MS = 120;

const Home = () => {
    const [query, setQuery] = useState('');
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    const router = useRouter();
    const cacheRef = useRef(new Map());
    const timerRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        (async () => setRecentSearches(await getRecentSearches()))();
    }, []);

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
                const results = await searchManga(q);
                const seen = new Set();
                const unique = [];

                for (const item of Array.isArray(results) ? results : []) {
                    const key = item?.id || item?.title || '';
                    if (!seen.has(key) && item?.title) {
                        seen.add(key);
                        unique.push(item);
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

    const openResult = async (item) => {
        const seriesId = item?.id || '';
        await handleAddSearch(item?.title || query);
        setQuery('');
        router.push(`/MangaDetails?seriesId=${encodeURIComponent(seriesId)}`);
    };

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                    <Text style={styles.logoText}>Mangako</Text>
                </View>

                <View style={styles.searchInline}>
                    <Ionicons name="search" size={18} color="#999" />
                    <TextInput
                        placeholder="Search manga..."
                        placeholderTextColor="#999"
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                    />
                </View>

                <Pressable onPress={() => setDropdownVisible(!dropdownVisible)}>
                    <Ionicons name="person-circle-outline" size={34} color="#333" />
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

            <ScrollView>
                <FollowedUpdatesRow />
            </ScrollView>

            {query.trim().length > 0 && (
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
                            {isSearching && <ActivityIndicator size="small" style={{ marginRight: 8 }} />}
                        </View>

                        {query.length === 0 && recentSearches.length > 0 && (
                            <FlatList
                                data={recentSearches}
                                keyExtractor={(item, idx) => `${item}-${idx}`}
                                renderItem={({ item }) => (
                                    <Pressable style={styles.historyRow} onPress={() => setQuery(item)}>
                                        <Ionicons name="time-outline" size={18} color="#aaa" />
                                        <Text style={styles.historyText}>{item}</Text>
                                    </Pressable>
                                )}
                            />
                        )}

                        {query.trim().length > 0 && searchResults.length === 0 && !isSearching && (
                            <Text style={{ padding: 16, color: '#666' }}>No results.</Text>
                        )}

                        {searchResults.length > 0 && (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item, idx) => `${item?.id || idx}`}
                                renderItem={({ item }) => {
                                    const title = item?.title || 'Unknown';
                                    const cover = item?.image ? proxied(item.image) : null;
                                    return (
                                        <Pressable onPress={() => openResult(item)} style={rowStyles.itemRow}>
                                            {cover ? (
                                                <Image source={{ uri: cover }} style={rowStyles.itemCover} />
                                            ) : (
                                                <View style={rowStyles.itemCoverFallback} />
                                            )}
                                            <Text style={rowStyles.itemTitle} numberOfLines={1}>
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
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
    logoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoImage: { width: 36, height: 36 },
    logoText: { fontSize: 18, fontWeight: '700' },
    searchInline: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f2f2f2', borderRadius: 12, paddingHorizontal: 10, height: 40 },
    searchInput: { flex: 1, marginLeft: 8, color: '#000' },
    triangle: { position: 'absolute', top: 115, right: 28, width: 12, height: 12, backgroundColor: '#fff', transform: [{ rotate: '45deg' }], borderTopColor: '#ccc', borderLeftColor: '#ccc', borderTopWidth: 1, borderLeftWidth: 1, zIndex: 101 },
    dropdown: { position: 'absolute', top: 120, right: 16, backgroundColor: '#fff', borderColor: '#ccc', borderWidth: 1, borderRadius: 6, paddingVertical: 8, zIndex: 99, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
    dropdownItem: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 16, color: '#333' },
    borderLine: { height: 1, backgroundColor: '#ccc', width: '100%' },
    searchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 999 },
    searchContainer: { flex: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#f1f1f1', borderRadius: 10, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, color: '#000' },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: '#eee', borderBottomWidth: 1, gap: 8 },
    historyText: { color: '#333', fontSize: 16 },
});

const rowStyles = StyleSheet.create({
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    itemCover: { width: 42, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: '#eee' },
    itemCoverFallback: { width: 42, height: 60, borderRadius: 4, marginRight: 12, backgroundColor: '#eee' },
    itemTitle: { flex: 1, fontSize: 16, color: '#000' },
    separator: { height: 1, backgroundColor: '#eee', marginLeft: 12 },
});