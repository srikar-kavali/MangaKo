import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Image, Pressable, TextInput, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { getRecentSearches, saveRecentSearches, getFavorites, getLastReadChapter } from '../searchStorage';
import { searchHardcodedManhwa } from '../../manga_api/hardcodedManhwas';
import { searchMangapill, proxied as proxiedMangapill } from '../../manga_api/mangapill';
import { proxied as proxiedAsura } from '../../manga_api/asurascans';

const LIVE_DELAY_MS = 300;
const CACHE_VERSION = 'v2';

const Home = () => {
    const [query, setQuery] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [followedManga, setFollowedManga] = useState([]);
    const [browseManga, setBrowseManga] = useState([]);
    const [loadingBrowse, setLoadingBrowse] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);

    const router = useRouter();
    const cacheRef = useRef(new Map());
    const timerRef = useRef(null);
    const abortRef = useRef(null);
    const searchInputRef = useRef(null);

    // Load favorites on mount
    useEffect(() => {
        (async () => {
            setRecentSearches(await getRecentSearches());

            const favs = await getFavorites();
            const followedWithProgress = await Promise.all(
                favs.map(async (fav) => {
                    const lastReadChapter = await getLastReadChapter(fav.url);
                    return { ...fav, lastReadChapter: lastReadChapter || null };
                })
            );
            const inProgress = followedWithProgress.filter(f => f.lastReadChapter);
            setFollowedManga(inProgress);
        })();
    }, []);

    // Load browse content
    useEffect(() => {
        (async () => {
            setLoadingBrowse(true);
            try {
                const [mangapillResults] = await Promise.all([
                    searchMangapill('', 20).catch(() => []),
                ]);
                const allManhwa = searchHardcodedManhwa('');
                const formattedManhwa = allManhwa.map(item => ({ ...item, source: 'asura' }));
                const formattedMangapill = (mangapillResults || []).map(item => ({
                    ...item, source: 'mangapill', id: item.url,
                }));
                setBrowseManga([...formattedManhwa, ...formattedMangapill]);
            } catch (err) {
                console.log('Failed to load browse content:', err);
            } finally {
                setLoadingBrowse(false);
            }
        })();
    }, []);

    // Search logic
    useEffect(() => {
        const q = query.trim();
        const qLower = q.toLowerCase();
        const cacheKey = `${CACHE_VERSION}:${qLower}`;

        if (!q) {
            setSearchResults([]);
            setIsSearching(false);
            if (abortRef.current) abortRef.current.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        if (cacheRef.current.has(cacheKey)) {
            setSearchResults(cacheRef.current.get(cacheKey));
        }

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setIsSearching(true);
            try {
                const [asuraResults, mangapillResults] = await Promise.all([
                    Promise.resolve(searchHardcodedManhwa(q)),
                    searchMangapill(q, 15).catch(() => [])
                ]);

                const formattedAsura = (asuraResults || []).map(item => ({ ...item, source: 'asura', cover: item.cover }));
                const formattedMangapill = (mangapillResults || []).map(item => ({ ...item, source: 'mangapill', id: item.url }));

                const scoreResult = (item) => {
                    const title = (item.title || '').toLowerCase();
                    if (title === qLower) return 1000;
                    if (title.startsWith(qLower)) return 500;
                    if (title.includes(qLower)) return 100;
                    return 0;
                };

                const allResults = [...formattedAsura, ...formattedMangapill]
                    .map(item => ({ ...item, score: scoreResult(item) }))
                    .sort((a, b) => b.score - a.score);

                if (!controller.signal.aborted) {
                    cacheRef.current.set(cacheKey, allResults);
                    setSearchResults(allResults);
                }
            } catch (e) {
                if (e?.name !== 'AbortError') console.log('Search error', e);
                if (!controller.signal.aborted) setSearchResults([]);
            } finally {
                if (!controller.signal.aborted) setIsSearching(false);
            }
        }, LIVE_DELAY_MS);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [query]);

    const handleAddSearch = async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const updated = [trimmed, ...recentSearches.filter((i) => i !== trimmed)].slice(0, 10);
        setRecentSearches(updated);
        await saveRecentSearches(updated);
    };

    const openManga = (item) => {
        if (item.source === 'asura') {
            router.push(`/MangaDetails?seriesId=${encodeURIComponent(item.id || item.url)}&source=asura`);
        } else {
            router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(item.id || item.url)}&source=mangapill`);
        }
    };

    const openResult = async (item) => {
        await handleAddSearch(item?.title || query);
        setQuery('');
        setSearchActive(false);
        openManga(item);
    };

    const openSearch = () => {
        setSearchActive(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };

    const closeSearch = () => {
        setQuery('');
        setSearchResults([]);
        setSearchActive(false);
    };

    const getProxiedImage = (item) => {
        const url = item.cover || item.coverUrl;
        if (!url) return null;
        return item.source === 'asura' ? proxiedAsura(url) : proxiedMangapill(url);
    };

    return (
        <SafeAreaView style={styles.screen}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                    <Text style={styles.logoText}>Mangako</Text>
                </View>

                <Pressable style={styles.headerIcon} onPress={openSearch}>
                    <Ionicons name="search" size={22} color="#333" />
                </Pressable>

                <Pressable style={styles.headerIcon} onPress={() => setDropdownVisible(!dropdownVisible)}>
                    <Ionicons name="person-circle-outline" size={28} color="#333" />
                </Pressable>
            </View>

            {dropdownVisible && (
                <>
                    <Pressable style={styles.dropdownOverlay} onPress={() => setDropdownVisible(false)} />
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

            {/* Main Scroll */}
            <ScrollView style={styles.mainScroll} showsVerticalScrollIndicator={false}>

                {/* Continue Reading */}
                {followedManga.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Continue Reading</Text>
                            <Pressable onPress={() => router.push('/tabs/library')}>
                                <Text style={styles.seeAll}>See All</Text>
                            </Pressable>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.horizontalList}
                        >
                            {followedManga.map((manga, idx) => (
                                <Pressable
                                    key={`${manga.url}-${idx}`}
                                    style={styles.continueCard}
                                    onPress={() => openManga(manga)}
                                >
                                    <Image
                                        source={{ uri: getProxiedImage(manga) }}
                                        style={styles.continueCover}
                                    />
                                    {manga.lastReadChapter && (
                                        <View style={styles.chapterBadge}>
                                            <Text style={styles.chapterBadgeText} numberOfLines={1}>
                                                {manga.lastReadChapter}
                                            </Text>
                                        </View>
                                    )}
                                    <Text style={styles.continueTitle} numberOfLines={2}>
                                        {manga.title}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Browse / Updates Grid */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Updates</Text>
                    </View>

                    {loadingBrowse ? (
                        <ActivityIndicator size="large" style={{ marginTop: 30 }} />
                    ) : (
                        <View style={styles.grid}>
                            {browseManga.map((manga, idx) => (
                                <Pressable
                                    key={`${manga.id}-${idx}`}
                                    style={styles.gridCard}
                                    onPress={() => openManga(manga)}
                                >
                                    <Image
                                        source={{ uri: getProxiedImage(manga) }}
                                        style={styles.gridCover}
                                    />
                                    <View style={styles.sourceTag}>
                                        <Text style={styles.sourceTagText}>
                                            {manga.source === 'asura' ? 'AS' : 'MP'}
                                        </Text>
                                    </View>
                                    <Text style={styles.gridTitle} numberOfLines={2}>
                                        {manga.title}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Search Overlay */}
            {searchActive && (
                <View style={styles.searchOverlay}>
                    <SafeAreaView style={{ flex: 1 }}>
                        {/* Search Bar */}
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={18} color="#aaa" style={{ marginRight: 8 }} />
                            <TextInput
                                ref={searchInputRef}
                                placeholder="Search manga..."
                                placeholderTextColor="#aaa"
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                autoFocus
                                returnKeyType="search"
                            />
                            {isSearching && <ActivityIndicator size="small" style={{ marginRight: 8 }} />}
                            <Pressable onPress={closeSearch} style={styles.cancelBtn}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>
                        </View>

                        <View style={styles.borderLine} />

                        {/* Results */}
                        {query.trim().length > 0 ? (
                            searchResults.length > 0 ? (
                                <FlatList
                                    data={searchResults}
                                    keyExtractor={(item, idx) => `${item?.id || idx}-${item.source}`}
                                    renderItem={({ item }) => {
                                        const cover = getProxiedImage(item);
                                        const sourceLabel = item.source === 'asura' ? 'AS' : 'MP';
                                        return (
                                            <Pressable onPress={() => openResult(item)} style={styles.resultRow}>
                                                {cover ? (
                                                    <Image source={{ uri: cover }} style={styles.resultCover} />
                                                ) : (
                                                    <View style={[styles.resultCover, { backgroundColor: '#eee' }]} />
                                                )}
                                                <View style={styles.resultInfo}>
                                                    <Text style={styles.resultTitle} numberOfLines={2}>
                                                        {item.title}
                                                    </Text>
                                                    <View style={styles.resultSourceBadge}>
                                                        <Text style={styles.resultSourceText}>{sourceLabel}</Text>
                                                    </View>
                                                </View>
                                                <Ionicons name="chevron-forward" size={16} color="#ccc" />
                                            </Pressable>
                                        );
                                    }}
                                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                                    keyboardShouldPersistTaps="handled"
                                />
                            ) : (
                                !isSearching && (
                                    <View style={styles.emptyState}>
                                        <Ionicons name="search-outline" size={48} color="#ddd" />
                                        <Text style={styles.emptyText}>No results for "{query}"</Text>
                                    </View>
                                )
                            )
                        ) : (
                            /* Recent Searches */
                            recentSearches.length > 0 && (
                                <View>
                                    <Text style={styles.recentLabel}>Recent</Text>
                                    {recentSearches.map((term, i) => (
                                        <Pressable
                                            key={i}
                                            style={styles.recentRow}
                                            onPress={() => setQuery(term)}
                                        >
                                            <Ionicons name="time-outline" size={16} color="#999" style={{ marginRight: 10 }} />
                                            <Text style={styles.recentText}>{term}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )
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

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#fff',
        gap: 8,
    },
    logoLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoImage: { width: 32, height: 32 },
    logoText: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
    headerIcon: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    borderLine: { height: 1, backgroundColor: '#e5e5e5' },

    // Dropdown
    dropdownOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
    },
    dropdown: {
        position: 'absolute', top: 60, right: 16,
        backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1,
        borderRadius: 8, paddingVertical: 6, zIndex: 100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
    },
    dropdownItem: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 15, color: '#333' },

    // Scroll
    mainScroll: { flex: 1 },
    section: { paddingTop: 20, paddingBottom: 8 },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingHorizontal: 16, marginBottom: 12,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
    seeAll: { fontSize: 13, color: '#007AFF', fontWeight: '600' },

    // Continue Reading (horizontal)
    horizontalList: { paddingHorizontal: 12, gap: 10 },
    continueCard: { width: 110, marginHorizontal: 4 },
    continueCover: {
        width: 110, height: 155, borderRadius: 6,
        backgroundColor: '#f0f0f0', marginBottom: 4,
    },
    chapterBadge: {
        backgroundColor: 'rgba(0,0,0,0.72)',
        paddingHorizontal: 6, paddingVertical: 3,
        borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4,
    },
    chapterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
    continueTitle: { fontSize: 12, fontWeight: '600', color: '#333', lineHeight: 16 },

    // Updates Grid (ComicK style - 2 columns, tall cards)
    grid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 8, gap: 3,
    },
    gridCard: {
        width: '49.3%',
        marginBottom: 16,
    },
    gridCover: {
        width: '100%',
        height: 260,
        borderRadius: 6,
        backgroundColor: '#f0f0f0',
        marginBottom: 6,
    },
    sourceTag: {
        position: 'absolute',
        top: 8, right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 4,
    },
    sourceTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    gridTitle: {
        fontSize: 13, fontWeight: '600',
        color: '#1a1a1a', lineHeight: 18,
        paddingHorizontal: 2,
    },

    // Search Overlay
    searchOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#fff', zIndex: 999,
    },
    searchBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: '#fff',
    },
    searchInput: {
        flex: 1, fontSize: 16, color: '#000',
        backgroundColor: '#f5f5f5', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 9,
        marginRight: 8,
    },
    cancelBtn: { paddingHorizontal: 4 },
    cancelText: { fontSize: 15, color: '#007AFF', fontWeight: '600' },

    // Results
    resultRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10,
    },
    resultCover: {
        width: 46, height: 64, borderRadius: 5,
        marginRight: 12, backgroundColor: '#f0f0f0',
    },
    resultInfo: { flex: 1 },
    resultTitle: { fontSize: 15, fontWeight: '500', color: '#1a1a1a', marginBottom: 4 },
    resultSourceBadge: {
        backgroundColor: '#f0f0f0', paddingHorizontal: 6,
        paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start',
    },
    resultSourceText: { fontSize: 10, fontWeight: '700', color: '#666' },
    separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 74 },

    // Empty / Recent
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyText: { color: '#999', fontSize: 15, marginTop: 12 },
    recentLabel: { fontSize: 13, fontWeight: '700', color: '#999', paddingHorizontal: 16, paddingVertical: 10 },
    recentRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
    },
    recentText: { fontSize: 15, color: '#333' },
});
