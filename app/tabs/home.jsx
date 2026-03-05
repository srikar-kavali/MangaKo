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
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [followedManga, setFollowedManga] = useState([]);
    const [browseManga, setBrowseManga] = useState([]);
    const [loadingBrowse, setLoadingBrowse] = useState(false);

    const router = useRouter();
    const cacheRef = useRef(new Map());
    const timerRef = useRef(null);
    const abortRef = useRef(null);

    // Load favorites on mount
    useEffect(() => {
        (async () => {
            setRecentSearches(await getRecentSearches());

            // Load followed manga with last read chapter info
            const favs = await getFavorites();
            const followedWithProgress = await Promise.all(
                favs.map(async (fav) => {
                    const lastReadChapter = await getLastReadChapter(fav.url);
                    return {
                        ...fav,
                        lastReadChapter: lastReadChapter || null,
                    };
                })
            );

            // Filter: only show if user has started reading (has lastReadChapter)
            const inProgress = followedWithProgress.filter(f => f.lastReadChapter);

            setFollowedManga(inProgress);
        })();
    }, []);

    // Load browse content (all manga from hardcoded + MangaPill)
    useEffect(() => {
        (async () => {
            setLoadingBrowse(true);
            try {
                // Get hardcoded manhwa and MangaPill results
                const [mangapillResults] = await Promise.all([
                    searchMangapill('', 20).catch(() => []),
                ]);

                // Get all hardcoded manhwa
                const allManhwa = searchHardcodedManhwa(''); // Empty query returns all

                const formattedManhwa = allManhwa.map(item => ({
                    ...item,
                    title: item.title,
                    source: 'asura',
                }));

                const formattedMangapill = (mangapillResults || []).map(item => ({
                    ...item,
                    source: 'mangapill',
                    id: item.url,
                }));

                setBrowseManga([...formattedManhwa, ...formattedMangapill]);
            } catch (err) {
                console.log('Failed to load browse content:', err);
            } finally {
                setLoadingBrowse(false);
            }
        })();
    }, []);

    // Search functionality (same as before)
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

                const formattedAsura = (asuraResults || []).map(item => ({
                    ...item,
                    source: 'asura',
                    cover: item.cover,
                }));

                const formattedMangapill = (mangapillResults || []).map(item => ({
                    ...item,
                    source: 'mangapill',
                    id: item.url,
                }));

                const scoreResult = (item) => {
                    const title = (item.title || '').toLowerCase();
                    if (title === qLower) return 1000;
                    if (title.startsWith(qLower)) return 500;
                    if (title.includes(qLower)) return 100;
                    return 0;
                };

                const allResults = [...formattedAsura, ...formattedMangapill].map(item => ({
                    ...item,
                    score: scoreResult(item)
                }));

                allResults.sort((a, b) => b.score - a.score);

                if (!controller.signal.aborted) {
                    cacheRef.current.set(cacheKey, allResults);
                    setSearchResults(allResults);
                }
            } catch (e) {
                if (e?.name !== 'AbortError') {
                    console.log('Search error', e);
                }
                if (!controller.signal.aborted) {
                    setSearchResults([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
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
        openManga(item);
    };

    const getProxiedImage = (item) => {
        if (item.source === 'asura') {
            return item.cover || item.coverUrl ? proxiedAsura(item.cover || item.coverUrl) : null;
        } else {
            return item.cover || item.coverUrl ? proxiedMangapill(item.cover || item.coverUrl) : null;
        }
    };

    return (
        <SafeAreaView style={styles.screen}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                    <Text style={styles.logoText}>Mangako</Text>
                </View>

                <Pressable
                    style={styles.searchButton}
                    onPress={() => setQuery(' ')} // Trigger search overlay
                >
                    <Ionicons name="search" size={20} color="#666" />
                </Pressable>

                <Pressable onPress={() => setDropdownVisible(!dropdownVisible)}>
                    <Ionicons name="person-circle-outline" size={32} color="#333" />
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

            {/* Main Content */}
            <ScrollView style={styles.mainScroll}>
                {/* Followed Manga Section */}
                {followedManga.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Continue Reading</Text>
                            <Pressable onPress={() => router.push('/tabs/library')}>
                                <Text style={styles.seeAll}>See All →</Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.horizontalScroll}
                        >
                            {followedManga.map((manga, idx) => (
                                <Pressable
                                    key={`${manga.url}-${idx}`}
                                    style={styles.followedCard}
                                    onPress={() => openManga(manga)}
                                >
                                    <Image
                                        source={{ uri: getProxiedImage(manga) }}
                                        style={styles.followedCover}
                                    />
                                    {/* Show last read chapter bar */}
                                    {manga.lastReadChapter && (
                                        <View style={styles.progressBar}>
                                            <Ionicons name="bookmark" size={12} color="#fff" style={{ marginRight: 4 }} />
                                            <Text style={styles.progressText}>
                                                {manga.lastReadChapter}
                                            </Text>
                                        </View>
                                    )}
                                    <Text style={styles.followedTitle} numberOfLines={2}>
                                        {manga.title}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Browse All Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Browse All</Text>

                    {loadingBrowse ? (
                        <ActivityIndicator size="large" style={{ marginTop: 20 }} />
                    ) : (
                        <View style={styles.browseGrid}>
                            {browseManga.map((manga, idx) => (
                                <Pressable
                                    key={`${manga.id}-${idx}`}
                                    style={styles.browseCard}
                                    onPress={() => openManga(manga)}
                                >
                                    <Image
                                        source={{ uri: getProxiedImage(manga) }}
                                        style={styles.browseCover}
                                    />
                                    <View style={styles.browseInfo}>
                                        <Text style={styles.browseTitle} numberOfLines={2}>
                                            {manga.title}
                                        </Text>
                                        <View style={styles.sourceTagSmall}>
                                            <Text style={styles.sourceTagTextSmall}>
                                                {manga.source === 'asura' ? 'AS' : 'MP'}
                                            </Text>
                                        </View>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Search Overlay */}
            {query.trim().length > 0 && (
                <View style={styles.searchOverlay}>
                    <SafeAreaView style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#aaa" style={styles.searchIcon} />
                            <TextInput
                                placeholder="Search manga..."
                                placeholderTextColor="#aaa"
                                style={styles.input}
                                value={query}
                                onChangeText={setQuery}
                                autoFocus
                                returnKeyType="search"
                            />
                            {isSearching && <ActivityIndicator size="small" style={{ marginRight: 8 }} />}
                            <Pressable onPress={() => setQuery('')}>
                                <Ionicons name="close-circle" size={20} color="#999" />
                            </Pressable>
                        </View>

                        {searchResults.length > 0 ? (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item, idx) => `${item?.id || idx}-${item.source}`}
                                renderItem={({ item }) => {
                                    const cover = getProxiedImage(item);
                                    const sourceLabel = item.source === 'asura' ? 'AS' : 'MP';

                                    return (
                                        <Pressable onPress={() => openResult(item)} style={searchStyles.itemRow}>
                                            {cover ? (
                                                <Image source={{ uri: cover }} style={searchStyles.itemCover} />
                                            ) : (
                                                <View style={searchStyles.itemCoverFallback} />
                                            )}
                                            <View style={searchStyles.itemInfo}>
                                                <Text style={searchStyles.itemTitle} numberOfLines={1}>
                                                    {item.title}
                                                </Text>
                                                <Text style={searchStyles.sourceTag}>{sourceLabel}</Text>
                                            </View>
                                        </Pressable>
                                    );
                                }}
                                ItemSeparatorComponent={() => <View style={searchStyles.separator} />}
                                keyboardShouldPersistTaps="handled"
                            />
                        ) : (
                            !isSearching && <Text style={styles.noResults}>No results found</Text>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
        backgroundColor: '#fff',
    },
    logoLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoImage: { width: 36, height: 36 },
    logoText: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
    searchButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    triangle: {
        position: 'absolute',
        top: 60,
        right: 28,
        width: 12,
        height: 12,
        backgroundColor: '#fff',
        transform: [{ rotate: '45deg' }],
        borderTopColor: '#ddd',
        borderLeftColor: '#ddd',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        zIndex: 101
    },
    dropdown: {
        position: 'absolute',
        top: 65,
        right: 16,
        backgroundColor: '#fff',
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 8,
        zIndex: 100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    dropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        fontSize: 15,
        color: '#333'
    },
    borderLine: { height: 1, backgroundColor: '#e5e5e5' },

    // Main Content
    mainScroll: { flex: 1 },
    section: { paddingVertical: 20 },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1a1a1a',
        paddingHorizontal: 16,
    },
    seeAll: { fontSize: 14, color: '#007AFF', fontWeight: '600' },

    // Followed Manga (Horizontal)
    horizontalScroll: { paddingHorizontal: 12, gap: 12 },
    followedCard: {
        width: 120,
        marginHorizontal: 4,
    },
    followedCover: {
        width: 120,
        height: 170,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
        marginBottom: 4,
    },
    progressBar: {
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 4,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginBottom: 6,
    },
    progressText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600'
    },
    followedTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        lineHeight: 16,
    },

    // Browse Grid (Vertical)
    browseGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        gap: 12,
    },
    browseCard: {
        width: '47%',
        marginBottom: 16,
    },
    browseCover: {
        width: '100%',
        height: 240,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
        marginBottom: 8,
    },
    browseInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    browseTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        lineHeight: 18,
        marginRight: 4,
    },
    sourceTagSmall: {
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    sourceTagTextSmall: {
        fontSize: 10,
        fontWeight: '700',
        color: '#666',
    },

    // Search Overlay
    searchOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        zIndex: 999
    },
    searchContainer: { flex: 1 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48
    },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: '#000' },
    noResults: {
        padding: 20,
        textAlign: 'center',
        color: '#999',
        fontSize: 15,
    },
});

const searchStyles = StyleSheet.create({
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12
    },
    itemCover: {
        width: 50,
        height: 70,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: '#f0f0f0'
    },
    itemCoverFallback: {
        width: 50,
        height: 70,
        borderRadius: 6,
        marginRight: 12,
        backgroundColor: '#f0f0f0'
    },
    itemInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    itemTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: '#1a1a1a',
        marginRight: 8
    },
    sourceTag: {
        fontSize: 10,
        fontWeight: '700',
        color: '#666',
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4
    },
    separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 78 },
});