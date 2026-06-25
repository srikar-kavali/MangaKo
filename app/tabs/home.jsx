import React, { useState, useEffect, useRef } from 'react';
import {
    SafeAreaView, View, Text, StyleSheet, Image, Pressable,
    TextInput, FlatList, ActivityIndicator, ScrollView,
    Animated, StatusBar,
} from 'react-native';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { getRecentSearches, saveRecentSearches, getFavorites, getLastReadChapter } from '../searchStorage';
import { searchHardcodedManhwa } from '../../manga_api/hardcodedManhwas';
import { searchMangapill, proxied as proxiedMangapill } from '../../manga_api/mangapill';
import { proxied as proxiedAsura } from '../../manga_api/asurascans';
import { getCoverUrl } from "../../api/coverurls";

const C = {
    bg0:'#07070a', bg1:'#0c0c10', bg2:'#111118', bg3:'#18181f', bg4:'#1f1f28',
    border:'rgba(255,255,255,0.06)', borderMid:'rgba(255,255,255,0.10)',
    text1:'#eeedf0', text2:'#7c7b88', text3:'#38373f',
    accent:'#7c6af5', accentBright:'#9d8fff',
    accentDim:'rgba(124,106,245,0.14)', accentBorder:'rgba(124,106,245,0.28)',
    green:'#34d399', greenDim:'rgba(52,211,153,0.10)', greenBorder:'rgba(52,211,153,0.25)',
    asuraBg:'rgba(124,106,245,0.82)', mpBg:'rgba(56,189,248,0.78)',
};

const LIVE_DELAY_MS = 300;
const CACHE_VERSION = 'v3';

export default function Home() {
    const [query, setQuery] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [followedManga, setFollowedManga] = useState([]);
    const [browseManga, setBrowseManga] = useState([]);
    const [loadingBrowse, setLoadingBrowse] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);

    const overlayAnim = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const cacheRef = useRef(new Map());
    const timerRef = useRef(null);
    const abortRef = useRef(null);
    const searchInputRef = useRef(null);

    useEffect(() => {
        (async () => {
            setRecentSearches(await getRecentSearches());
            const favs = await getFavorites();

            const withProgress = await Promise.all(
                favs.map(async f => {
                    // Pull full storage context object safely (containing .chapterId and .timestamp updates)
                    const progressData = await getLastReadChapter(f.url) || null;
                    return {
                        ...f,
                        lastReadChapter: progressData?.chapterId || progressData || null,
                        lastReadTimestamp: progressData?.timestamp || 0
                    };
                })
            );

            // SORT: Order items descending by tracking timestamp to move most recently read to the front
            const sortedHistory = withProgress
                .filter(f => f.lastReadChapter)
                .sort((a, b) => b.lastReadTimestamp - a.lastReadTimestamp);

            setFollowedManga(sortedHistory);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            setLoadingBrowse(true);
            try {
                const [mp] = await Promise.all([searchMangapill('', 20).catch(() => [])]);
                const hardcoded = searchHardcodedManhwa('').map(i => ({ ...i, source: i.source || 'asura' }));
                const mpFmt = (mp || []).map(i => ({ ...i, source: 'mangapill', id: i.url }));
                setBrowseManga([...hardcoded, ...mpFmt]);
            } catch(e) {} finally { setLoadingBrowse(false); }
        })();
    }, []);

    useEffect(() => {
        const q = query.trim(), qL = q.toLowerCase(), key = `${CACHE_VERSION}:${qL}`;
        if (!q) { setSearchResults([]); setIsSearching(false); abortRef.current?.abort(); clearTimeout(timerRef.current); return; }
        if (cacheRef.current.has(key)) setSearchResults(cacheRef.current.get(key));
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            abortRef.current?.abort();
            const ctrl = new AbortController(); abortRef.current = ctrl;
            setIsSearching(true);
            try {
                const [ar, mr] = await Promise.all([Promise.resolve(searchHardcodedManhwa(q)), searchMangapill(q, 15).catch(() => [])]);
                const score = i => { const t=(i.title||'').toLowerCase(); return t===qL?1000:t.startsWith(qL)?500:t.includes(qL)?100:0; };
                const all = [...(ar||[]).map(i=>({...i, source: i.source || 'asura'})), ...(mr||[]).map(i=>({...i,source:'mangapill',id:i.url}))]
                    .map(i=>({...i,score:score(i)})).sort((a,b)=>b.score-a.score);
                if (!ctrl.signal.aborted) { cacheRef.current.set(key, all); setSearchResults(all); }
            } catch(e) { if (!abortRef.current?.signal.aborted) setSearchResults([]); }
            finally { if (!abortRef.current?.signal.aborted) setIsSearching(false); }
        }, LIVE_DELAY_MS);
        return () => clearTimeout(timerRef.current);
    }, [query]);

    const openSearch = () => {
        setSearchActive(true);
        Animated.spring(overlayAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 14 }).start();
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };
    const closeSearch = () => {
        Animated.timing(overlayAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
            setSearchActive(false); setQuery(''); setSearchResults([]);
        });
    };
    const handleAddSearch = async (text) => {
        const t = text.trim(); if (!t) return;
        const u = [t, ...recentSearches.filter(i=>i!==t)].slice(0,10);
        setRecentSearches(u); await saveRecentSearches(u);
    };
    const getProxied = (item) => {
        const url = getCoverUrl(item.id) || getCoverUrl(item.url) || item.cover || item.coverUrl;
        if (!url) return null;
        if (item.source === 'mangapill') return proxiedMangapill(url);
        return proxiedAsura(url);
    };
    const getSource = (m) => {
        if (m.source) return m.source;
        if (String(m.url || m.id || '').startsWith('mgeko__')) return 'mgeko';
        return (String(m.url || m.id || '').includes('/') || String(m.url || m.id || '').includes('http')) ? 'mangapill' : 'asura';
    };
    const openManga = (item) => {
        const src = item.source || getSource(item);
        const id = item.id || item.url;
        if (src === 'asura' || src === 'mgeko') {
            router.push(`/MangaDetails?seriesId=${encodeURIComponent(id)}&source=${src}`);
        } else {
            router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(id)}&source=mangapill`);
        }
    };
    const openResult = async (item) => { await handleAddSearch(item?.title||query); closeSearch(); openManga(item); };

    const openLastRead = (manga) => {
        if (!manga.lastReadChapter) return;
        const src = getSource(manga), id = manga.url || manga.id;
        if (src === 'asura' || src === 'mgeko') {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(id)}&chapterId=${encodeURIComponent(manga.lastReadChapter)}&source=${src}`);
        } else {
            router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(manga.lastReadChapter)}&mangapillUrl=${encodeURIComponent(id)}&source=mangapill`);
        }
    };

    const fmtCh = (id, src) => {
        if (!id) return '';
        if (src==='asura') return `Ch.${id}`;
        const slug = String(id).split('/').filter(Boolean).pop()||'';
        const m = slug.match(/(\d+(\.\d+)?)/); return m ? `Ch.${m[1]}` : '▶';
    };

    return (
        <SafeAreaView style={S.screen}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg0} />

            {/* HEADER */}
            <View style={S.header}>
                <View style={S.headerInner}>
                    <View style={S.logoRow}>
                        <Image source={dragonLogo} style={S.logoImg} />
                        <Text style={S.logoText}>Mangako</Text>
                    </View>
                    <View style={S.headerRight}>
                        <Pressable style={S.iconBtn} onPress={openSearch} hitSlop={10}>
                            <Ionicons name="search-outline" size={20} color={C.text2} />
                        </Pressable>
                        <Pressable style={S.iconBtn} onPress={() => setDropdownVisible(v=>!v)} hitSlop={10}>
                            <Ionicons name="person-circle-outline" size={23} color={C.text2} />
                        </Pressable>
                    </View>
                </View>
            </View>

            {dropdownVisible && (
                <>
                    <Pressable style={S.ddMask} onPress={() => setDropdownVisible(false)} />
                    <View style={S.dropdown}>
                        <Pressable style={S.ddRow} onPress={() => { setDropdownVisible(false); router.push('/settings'); }}>
                            <Ionicons name="settings-outline" size={14} color={C.text2} />
                            <Text style={S.ddText}>Settings</Text>
                        </Pressable>
                        <View style={S.ddLine} />
                        <Pressable style={S.ddRow} onPress={async () => { setDropdownVisible(false); await signOut(); router.replace('/login'); }}>
                            <Ionicons name="log-out-outline" size={14} color={C.accent} />
                            <Text style={[S.ddText, { color: C.accent }]}>Sign Out</Text>
                        </Pressable>
                    </View>
                </>
            )}

            <ScrollView style={S.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>

                {/* CONTINUE READING */}
                {followedManga.length > 0 && (
                    <View style={S.section}>
                        <View style={S.sectionHead}>
                            <Text style={S.sectionTitle}>Continue Reading</Text>
                            <Pressable onPress={() => router.push('/tabs/library')} style={S.seeAllBtn}>
                                <Text style={S.seeAllText}>See All</Text>
                                <Ionicons name="chevron-forward" size={12} color={C.accentBright} />
                            </Pressable>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.hList}>
                            {followedManga.map((manga, idx) => {
                                const img = getProxied(manga);
                                // CHECK: Verify if reader has hit the absolute edge of scraped material
                                const isCaughtUp = manga.lastReadChapter && manga.latestChapter && (manga.lastReadChapter === manga.latestChapter);

                                return (
                                    <View key={`${manga.url}-${idx}`} style={S.contCard}>
                                        <Pressable
                                            style={({ pressed }) => [S.contCoverWrap, { opacity: pressed ? 0.75 : 1 }]}
                                            onPress={() => openManga(manga)}
                                        >
                                            {img ? (
                                                <>
                                                    <Image source={{ uri: img }} style={S.contCover} resizeMode="cover" />
                                                    <View style={S.contGradient} />
                                                </>
                                            ) : (
                                                <View style={S.contCoverEmpty}>
                                                    <Ionicons name="image-outline" size={26} color={C.text3} />
                                                    <Text style={S.contCoverEmptyText}>No cover</Text>
                                                </View>
                                            )}
                                            <View style={[S.srcDot, { backgroundColor: manga.source==='asura' ? C.asuraBg : C.mpBg }]} />
                                        </Pressable>

                                        {/* CAUGHT-UP CORRECTION INDICATOR BLOCK */}
                                        {!isCaughtUp ? (
                                            <Pressable
                                                style={({ pressed }) => [S.contChBtn, { opacity: pressed ? 0.75 : 1 }]}
                                                onPress={() => openLastRead(manga)}
                                            >
                                                <Ionicons name="play" size={9} color="#fff" />
                                                <Text style={S.contChText} numberOfLines={1}>
                                                    {fmtCh(manga.lastReadChapter, manga.source)}
                                                </Text>
                                            </Pressable>
                                        ) : (
                                            /* Clean space fallback matching original card profile footprint dimensions when caught up */
                                            <View style={S.caughtUpSpacer} />
                                        )}

                                        <Text style={S.contTitle} numberOfLines={2}>{manga.title}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* NEW CHAPTERS */}
                <View style={S.section}>
                    <View style={S.sectionHead}>
                        <Text style={S.sectionTitle}>New Chapters</Text>
                        <View style={S.liveBadge}>
                            <View style={S.liveDot} />
                            <Text style={S.liveText}>LIVE</Text>
                        </View>
                    </View>

                    {loadingBrowse ? (
                        <View style={S.grid}>
                            {[...Array(6)].map((_,i) => (
                                <View key={i} style={S.skelCard}>
                                    <View style={S.skelCover} />
                                    <View style={S.skelLine} />
                                    <View style={[S.skelLine, { width: '55%' }]} />
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={S.grid}>
                            {browseManga.map((manga, idx) => {
                                const img = getProxied(manga);
                                const isAS = manga.source === 'asura';
                                return (
                                    <Pressable
                                        key={`${manga.id}-${idx}`}
                                        style={({ pressed }) => [S.gridCard, { opacity: pressed ? 0.72 : 1 }]}
                                        onPress={() => openManga(manga)}
                                    >
                                        <View style={S.gridCoverWrap}>
                                            {img ? (
                                                <Image source={{ uri: img }} style={S.gridCover} resizeMode="cover" />
                                            ) : (
                                                <View style={S.gridCoverEmpty}>
                                                    <Ionicons name="book-outline" size={20} color={C.text3} />
                                                </View>
                                            )}
                                            {!!img && <View style={S.gridGradient} />}
                                            <View style={[S.gridBadge, { backgroundColor: isAS ? C.asuraBg : manga.source === 'mgeko' ? 'rgba(52,211,153,0.80)' : C.mpBg }]}>
                                                <Text style={S.gridBadgeText}>{isAS ? 'AS' : manga.source === 'mgeko' ? 'MG' : 'MP'}</Text>
                                            </View>
                                        </View>
                                        <Text style={S.gridTitle} numberOfLines={2}>{manga.title}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* SEARCH OVERLAY */}
            {searchActive && (
                <Animated.View style={[S.searchOverlay, {
                    opacity: overlayAnim,
                    transform: [{ translateY: overlayAnim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }],
                }]}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={S.searchTopBar}>
                            <View style={S.searchInputRow}>
                                <Ionicons name="search-outline" size={16} color={C.text3} style={{ marginRight: 8 }} />
                                <TextInput
                                    ref={searchInputRef}
                                    placeholder="Search titles..."
                                    placeholderTextColor={C.text3}
                                    style={S.searchInput}
                                    value={query}
                                    onChangeText={setQuery}
                                    returnKeyType="search"
                                />
                                {isSearching
                                    ? <ActivityIndicator size="small" color={C.accent} />
                                    : query.length > 0 && <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={C.text3} /></Pressable>
                                }
                            </View>
                            <Pressable onPress={closeSearch} style={S.cancelBtn}>
                                <Text style={S.cancelText}>Cancel</Text>
                            </Pressable>
                        </View>
                        <View style={S.hairline} />

                        {query.trim().length > 0 ? (
                            searchResults.length > 0 ? (
                                <FlatList
                                    data={searchResults}
                                    keyExtractor={(item,i) => `${item?.id||i}-${item.source}`}
                                    keyboardShouldPersistTaps="handled"
                                    ItemSeparatorComponent={() => <View style={S.resSep} />}
                                    renderItem={({ item }) => {
                                        const cover = getProxied(item);
                                        const isAS = item.source === 'asura';
                                        return (
                                            <Pressable
                                                onPress={() => openResult(item)}
                                                style={({ pressed }) => [S.resRow, { backgroundColor: pressed ? C.bg3 : 'transparent' }]}
                                            >
                                                {cover
                                                    ? <Image source={{ uri: cover }} style={S.resCover} />
                                                    : <View style={[S.resCover, { backgroundColor: C.bg3, alignItems:'center', justifyContent:'center' }]}><Ionicons name="book-outline" size={18} color={C.text3} /></View>
                                                }
                                                <View style={S.resInfo}>
                                                    <Text style={S.resTitle} numberOfLines={2}>{item.title}</Text>
                                                    <View style={[S.resBadge, { backgroundColor: isAS ? C.accentDim : 'rgba(56,189,248,0.12)' }]}>
                                                        <Text style={[S.resBadgeText, { color: isAS ? C.accentBright : '#7dd3fc' }]}>
                                                            {isAS ? 'AsuraScans' : 'MangaPill'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Ionicons name="chevron-forward" size={14} color={C.text3} />
                                            </Pressable>
                                        );
                                    }}
                                />
                            ) : (
                                !isSearching && (
                                    <View style={S.emptySearch}>
                                        <Text style={S.emptySearchTitle}>No results</Text>
                                        <Text style={S.emptySearchSub}>Try a different title</Text>
                                    </View>
                                )
                            )
                        ) : recentSearches.length > 0 ? (
                            <View>
                                <Text style={S.recentLabel}>RECENT</Text>
                                {recentSearches.map((term, i) => (
                                    <Pressable
                                        key={i}
                                        style={({ pressed }) => [S.recentRow, { backgroundColor: pressed ? C.bg3 : 'transparent' }]}
                                        onPress={() => setQuery(term)}
                                    >
                                        <Ionicons name="time-outline" size={14} color={C.text3} style={{ marginRight: 12 }} />
                                        <Text style={S.recentText}>{term}</Text>
                                        <Ionicons name="arrow-up-back-outline" size={13} color={C.text3} style={{ marginLeft: 'auto' }} />
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}
                    </SafeAreaView>
                </Animated.View>
            )}
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg1 },
    header: { backgroundColor: C.bg1, borderBottomWidth: 1, borderBottomColor: C.border },
    headerInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13 },
    logoRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    logoImg: { width: 28, height: 28 },
    logoText: { fontSize: 20, fontWeight: '800', color: C.text1, letterSpacing: -0.8 },
    headerRight: { flexDirection: 'row', gap: 2 },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },

    ddMask: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 },
    dropdown: {
        position: 'absolute', top: 68, right: 14, zIndex: 99,
        backgroundColor: C.bg3, borderWidth: 1, borderColor: C.borderMid,
        borderRadius: 14, paddingVertical: 6, minWidth: 152,
        shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 14,
    },
    ddRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
    ddText: { fontSize: 14, fontWeight: '500', color: C.text1 },
    ddLine: { height: 1, backgroundColor: C.border, marginHorizontal: 12 },

    scroll: { flex: 1 },
    section: { paddingTop: 24 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text1, letterSpacing: -0.2 },
    seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    seeAllText: { fontSize: 12, fontWeight: '600', color: C.accentBright },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentDim, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
    liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.accent },
    liveText: { fontSize: 9, fontWeight: '800', color: C.accentBright, letterSpacing: 1 },

    hList: { paddingHorizontal: 18, gap: 11, paddingRight: 24 },
    contCard: { width: 108 },
    contCoverWrap: {
        width: 108, height: 154,
        borderRadius: 10, overflow: 'hidden',
        backgroundColor: '#2a2a35',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
        marginBottom: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
    },
    contCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    contCoverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
    contCoverEmptyText: { fontSize: 9, color: C.text3, fontWeight: '600', letterSpacing: 0.3 },
    contGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, backgroundColor: 'rgba(7,7,10,0.65)' },
    srcDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },

    contChBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 4, backgroundColor: C.accent,
        borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6,
        marginBottom: 7,
        shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6,
    },
    contChText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.1 },
    caughtUpSpacer: { height: 22, marginBottom: 7 }, // Precise spacer layout fallback

    contTitle: { fontSize: 11, fontWeight: '600', color: C.text2, lineHeight: 15 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10 },
    gridCard: { width: '30.5%', marginBottom: 14 },
    gridCoverWrap: {
        width: '100%', aspectRatio: 0.68,
        borderRadius: 9, overflow: 'hidden',
        backgroundColor: C.bg3, marginBottom: 7,
        shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 7,
    },
    gridCover: { width: '100%', height: '100%' },
    gridCoverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg3 },
    gridGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, backgroundColor: 'rgba(7,7,10,0.5)' },
    gridBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    gridBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
    gridTitle: { fontSize: 11, fontWeight: '600', color: C.text2, lineHeight: 15 },

    skelCard: { width: '30.5%', marginBottom: 14 },
    skelCover: { width: '100%', aspectRatio: 0.68, borderRadius: 9, backgroundColor: C.bg3 },
    skelLine: { height: 9, borderRadius: 4, backgroundColor: C.bg3, marginTop: 7, width: '80%' },

    searchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg0, zIndex: 999 },
    searchTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    searchInputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg3, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: 15, color: C.text1 },
    cancelBtn: { paddingHorizontal: 2 },
    cancelText: { fontSize: 14, fontWeight: '700', color: C.accentBright },
    hairline: { height: 1, backgroundColor: C.border },

    resRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    resCover: { width: 44, height: 62, borderRadius: 6, backgroundColor: C.bg3 },
    resInfo: { flex: 1, gap: 5 },
    resTitle: { fontSize: 14, fontWeight: '600', color: C.text1, lineHeight: 19 },
    resBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    resBadgeText: { fontSize: 10, fontWeight: '700' },
    resSep: { height: 1, backgroundColor: C.border, marginLeft: 72 },

    emptySearch: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 6 },
    emptySearchTitle: { fontSize: 16, fontWeight: '700', color: C.text2 },
    emptySearchSub: { fontSize: 13, color: C.text3 },

    recentLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: C.text3, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    recentRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    recentText: { fontSize: 14, color: C.text2 },
});