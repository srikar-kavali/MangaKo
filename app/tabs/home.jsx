import React, { useState, useCallback, useRef } from 'react';
import {
    SafeAreaView, View, Text, StyleSheet, Image, Pressable,
    TextInput, FlatList, ActivityIndicator, ScrollView,
    Animated, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import {
    getRecentSearches, saveRecentSearches, getFavorites,
    getLastReadChapterInfo, getLatestChapter, saveLatestChapter,
} from '../searchStorage';
import { searchHardcodedManhwa } from '../../manga_api/hardcodedManhwas';
import { searchMangapill, getMangapillManga, proxied as proxiedMangapill } from '../../manga_api/mangapill';
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
const BACKEND = process.env.EXPO_PUBLIC_CHAPTERS_API;

const BATCH_SIZE = 5;
const BATCH_GAP_MS = 1200;
const STALE_AFTER_MS = 30 * 60 * 1000;

// ── Storage key helpers ───────────────────────────────────────────────────────
// newchapter:${key}  — timestamp written when bg fetch finds a new chapter.
//                      Used as sort priority so card stays at front after reopen.
//                      Cleared when user reads that new chapter.
const newChapterKey = (k) => `newchapter:${k}`;

// ── Chapter number extraction ─────────────────────────────────────────────────
function chapterNum(id) {
    const s = String(id ?? '');
    const m = s.match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

function extractNewest(chapters) {
    if (!chapters?.length) return null;
    const withNums = chapters.map(ch => {
        const s = String(ch?.id ?? ch?.url ?? '');
        const m = s.match(/(\d+(\.\d+)?)/);
        return { ch, num: m ? parseFloat(m[1]) : -1 };
    });
    withNums.sort((a, b) => b.num - a.num);
    return withNums[0]?.ch?.id ?? null;
}

// ── Background fetch ──────────────────────────────────────────────────────────
async function fetchLatestChapterId(key, source) {
    try {
        if (source === 'mangapill') {
            const mangapillUrl = key.includes('mangapill.com')
                ? key
                : `https://mangapill.com/manga/${key.replace('__', '/')}`;
            const data = await getMangapillManga(mangapillUrl);
            return extractNewest(data?.chapters);
        }
        const endpoint = source === 'mgeko' ? 'mgeko-chapters' : 'asura-chapters';
        const res = await fetch(
            `${BACKEND}/api/${endpoint}?seriesId=${encodeURIComponent(key)}`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return null;
        const json = await res.json();
        return extractNewest(json?.chapters);
    } catch {
        return null;
    }
}

async function runBatched(tasks, batchSize, gapMs, cancelledRef) {
    for (let i = 0; i < tasks.length; i += batchSize) {
        if (cancelledRef?.current) return;
        await Promise.all(tasks.slice(i, i + batchSize).map(t => t()));
        if (i + batchSize < tasks.length) {
            await new Promise(r => setTimeout(r, gapMs));
        }
    }
}

// ── Card state logic ──────────────────────────────────────────────────────────
//
// Three possible card states:
//
//  1. CAUGHT_UP     — lastRead === latestChapter (exact or numeric)
//                     → "Up to date" box
//
//  2. NEW_CHAPTER   — latestChapter exists and is ahead of lastRead
//                     → green button showing lastReadChapter (resume from here)
//                       green colour signals something new is available
//
//  3. IN_PROGRESS   — no latestChapter data yet, or mid-series
//                     → purple button showing lastReadChapter
//
function resolveCardState(manga) {
    const { lastReadChapter, latestChapter } = manga;

    if (!lastReadChapter) return { state: 'IN_PROGRESS' };

    const readNum   = chapterNum(lastReadChapter);
    const latestNum = chapterNum(latestChapter);

    const exactMatch = latestChapter && String(lastReadChapter) === String(latestChapter);
    const numMatch   = readNum !== null && latestNum !== null && readNum >= latestNum;

    if (exactMatch || numMatch) return { state: 'CAUGHT_UP' };

    // latestChapter is ahead of lastRead — new chapter available
    if (latestChapter) return { state: 'NEW_CHAPTER' };

    // No latest chapter data yet — just show progress
    return { state: 'IN_PROGRESS' };
}

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
    const bgCancelledRef = useRef(false);

    const getSource = (m) => {
        if (m.source) return m.source;
        const id = String(m.url || m.id || '');
        if (id.startsWith('mgeko__')) return 'mgeko';
        if (/^\d+__/.test(id)) return 'mangapill';
        if (id.includes('mangapill.com')) return 'mangapill';
        if (id.includes('/') || id.includes('http')) return 'mangapill';
        return 'asura';
    };

    const loadFollowedManga = useCallback(async () => {
        const favs = await getFavorites();

        const withProgress = await Promise.all(
            favs.map(async f => {
                const key = f.url;
                const info = await getLastReadChapterInfo(key);
                if (!info?.chapterUrl) return null;

                const latestChapter = await getLatestChapter(key);

                // Read persisted sort bump (set when new chapter found by bg fetch)
                let newChapterAt = null;
                try {
                    const raw = await AsyncStorage.getItem(newChapterKey(key));
                    if (raw) newChapterAt = parseInt(raw);
                } catch { /* ignore */ }

                return {
                    ...f,
                    lastReadChapter: info.chapterUrl,
                    lastReadTimestamp: info.timestamp || 0,
                    latestChapter: latestChapter ?? null,
                    sortPriority: newChapterAt ?? info.timestamp ?? 0,
                };
            })
        );

        const sorted = withProgress
            .filter(Boolean)
            .sort((a, b) => b.sortPriority - a.sortPriority);

        setFollowedManga(sorted);
        return sorted;
    }, []);

    const runBackgroundFetch = useCallback(async (series) => {
        if (!series?.length) return;
        bgCancelledRef.current = false;
        const now = Date.now();

        const tasks = series.map(manga => async () => {
            if (bgCancelledRef.current) return;
            const key = manga.url;
            const src = getSource(manga);

            try {
                const lastChecked = await AsyncStorage.getItem(`bgcheck:${key}`);
                if (lastChecked && now - parseInt(lastChecked) < STALE_AFTER_MS) return;
            } catch { /* continue */ }

            const latestId = await fetchLatestChapterId(key, src);
            if (!latestId || bgCancelledRef.current) return;

            await AsyncStorage.setItem(`bgcheck:${key}`, String(now)).catch(() => {});

            const stored = await getLatestChapter(key);
            if (latestId === String(stored ?? '')) return;

            // New chapter found — persist, write sort bump, move card to front
            await saveLatestChapter(key, latestId);
            await AsyncStorage.setItem(newChapterKey(key), String(now)).catch(() => {});

            setFollowedManga(prev => {
                const idx = prev.findIndex(m => m.url === key);
                if (idx < 0) return prev;
                const patched = { ...prev[idx], latestChapter: latestId, sortPriority: now };
                return [patched, ...prev.filter((_, i) => i !== idx)];
            });
        });

        await runBatched(tasks, BATCH_SIZE, BATCH_GAP_MS, bgCancelledRef);
    }, []);

    useFocusEffect(
        useCallback(() => {
            bgCancelledRef.current = false;
            (async () => {
                setRecentSearches(await getRecentSearches());
                const series = await loadFollowedManga();
                runBackgroundFetch(series);
            })();
            return () => { bgCancelledRef.current = true; };
        }, [loadFollowedManga, runBackgroundFetch])
    );

    React.useEffect(() => {
        (async () => {
            setLoadingBrowse(true);
            try {
                const mp = await searchMangapill('', 20).catch(() => []);
                const hardcoded = searchHardcodedManhwa('').map(i => ({ ...i, source: i.source || 'asura' }));
                const mpFmt = (mp || []).map(i => ({ ...i, source: 'mangapill', id: i.url }));
                setBrowseManga([...hardcoded, ...mpFmt]);
            } catch (e) {} finally { setLoadingBrowse(false); }
        })();
    }, []);

    React.useEffect(() => {
        const q = query.trim(), qL = q.toLowerCase(), key = `${CACHE_VERSION}:${qL}`;
        if (!q) {
            setSearchResults([]); setIsSearching(false);
            abortRef.current?.abort(); clearTimeout(timerRef.current);
            return;
        }
        if (cacheRef.current.has(key)) setSearchResults(cacheRef.current.get(key));
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            abortRef.current?.abort();
            const ctrl = new AbortController(); abortRef.current = ctrl;
            setIsSearching(true);
            try {
                const [ar, mr] = await Promise.all([
                    Promise.resolve(searchHardcodedManhwa(q)),
                    searchMangapill(q, 15).catch(() => []),
                ]);
                const score = i => {
                    const t = (i.title || '').toLowerCase();
                    return t === qL ? 1000 : t.startsWith(qL) ? 500 : t.includes(qL) ? 100 : 0;
                };
                const all = [
                    ...(ar || []).map(i => ({ ...i, source: i.source || 'asura' })),
                    ...(mr || []).map(i => ({ ...i, source: 'mangapill', id: i.url })),
                ].map(i => ({ ...i, score: score(i) })).sort((a, b) => b.score - a.score);
                if (!ctrl.signal.aborted) { cacheRef.current.set(key, all); setSearchResults(all); }
            } catch (e) {
                if (!abortRef.current?.signal.aborted) setSearchResults([]);
            } finally {
                if (!abortRef.current?.signal.aborted) setIsSearching(false);
            }
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
        const u = [t, ...recentSearches.filter(i => i !== t)].slice(0, 10);
        setRecentSearches(u); await saveRecentSearches(u);
    };

    const getProxied = (item) => {
        const url = getCoverUrl(item.id) || getCoverUrl(item.url) || item.cover || item.coverUrl;
        if (!url) return null;
        if (item.source === 'mangapill') return proxiedMangapill(url);
        return proxiedAsura(url);
    };

    const openManga = (item) => {
        const src = item.source || getSource(item);
        const id = item.id || item.url;
        // Pass along the title we already know from search/browse so MangaDetails
        // has a reliable fallback if the detail-page scrape returns no title
        // (this was the cause of MangaPill favorites saving without a title).
        const titleParam = item.title ? `&title=${encodeURIComponent(item.title)}` : '';
        if (src === 'asura' || src === 'mgeko') {
            router.push(`/MangaDetails?seriesId=${encodeURIComponent(id)}&source=${src}${titleParam}`);
        } else {
            const mangapillUrl = id.includes('mangapill.com')
                ? id
                : `https://mangapill.com/manga/${id.replace('__', '/')}`;
            router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill${titleParam}`);
        }
    };

    const openResult = async (item) => {
        await handleAddSearch(item?.title || query);
        closeSearch();
        openManga(item);
    };

    // Open any given chapter id for a manga (used for both "resume where I left off"
    // and "jump to the newest chapter" — the two need different chapter ids).
    const openChapter = (manga, chapterId) => {
        if (!chapterId) return;
        const src = getSource(manga);
        const id = manga.url || manga.id;
        if (src === 'mangapill') {
            const mangapillUrl = id.includes('mangapill.com')
                ? id
                : `https://mangapill.com/manga/${id.replace('__', '/')}`;
            router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(chapterId)}&mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill`);
        } else {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(id)}&chapterId=${encodeURIComponent(chapterId)}&source=${src}`);
        }
    };

    // Resume from last read chapter (IN_PROGRESS / CAUGHT_UP state)
    const openLastRead = (manga) => openChapter(manga, manga.lastReadChapter);

    const fmtCh = (id, src) => {
        if (!id) return '';
        if (src === 'asura' || src === 'mgeko') return `Ch.${id}`;
        const slug = String(id).split('/').filter(Boolean).pop() || '';
        const m = slug.match(/(\d+(\.\d+)?)/);
        return m ? `Ch.${m[1]}` : '?';
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
                        <Pressable style={S.iconBtn} onPress={() => setDropdownVisible(v => !v)} hitSlop={10}>
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
                        <Pressable style={S.ddRow} onPress={async () => {
                            setDropdownVisible(false); await signOut(); router.replace('/login');
                        }}>
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
                            {followedManga.map((manga, i) => {
                                const img = getProxied(manga);
                                const src = getSource(manga);
                                const { state } = resolveCardState(manga);

                                return (
                                    <View key={`${manga.url}-${i}`} style={S.contCard}>
                                        <Pressable
                                            style={({ pressed }) => [S.contCoverWrap, { opacity: pressed ? 0.75 : 1 }]}
                                            onPress={() => openManga(manga)}
                                        >
                                            {img ? (
                                                <>
                                                    <Image source={{ uri: img }} style={S.contCover} resizeMode="cover" onError={() => {}} />
                                                    <View style={S.contGradient} />
                                                </>
                                            ) : (
                                                <View style={S.contCoverEmpty}>
                                                    <Ionicons name="image-outline" size={26} color={C.text3} />
                                                    <Text style={S.contCoverEmptyText}>No cover</Text>
                                                </View>
                                            )}
                                            <View style={[S.srcDot, {
                                                backgroundColor: src === 'asura' ? C.asuraBg
                                                    : src === 'mgeko' ? 'rgba(52,211,153,0.82)'
                                                        : C.mpBg,
                                            }]} />
                                        </Pressable>

                                        {state === 'CAUGHT_UP' ? (
                                            <View style={S.caughtUpBox}>
                                                <Text style={S.caughtUpText}>Up to date</Text>
                                            </View>
                                        ) : state === 'NEW_CHAPTER' ? (
                                            // New chapter available — show and open the newest chapter
                                            // (not where the user left off). Green signals something new exists.
                                            <Pressable
                                                style={({ pressed }) => [S.contChBtn, S.contChBtnNew, { opacity: pressed ? 0.75 : 1 }]}
                                                onPress={() => openChapter(manga, manga.latestChapter)}
                                            >
                                                <Text style={S.contChText} numberOfLines={1}>
                                                    {fmtCh(manga.latestChapter, src)}
                                                </Text>
                                            </Pressable>
                                        ) : (
                                            // Mid-series — show where they are
                                            <Pressable
                                                style={({ pressed }) => [S.contChBtn, { opacity: pressed ? 0.75 : 1 }]}
                                                onPress={() => openLastRead(manga)}
                                            >
                                                <Text style={S.contChText} numberOfLines={1}>
                                                    {fmtCh(manga.lastReadChapter, src)}
                                                </Text>
                                            </Pressable>
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
                            {[...Array(6)].map((_, i) => (
                                <View key={i} style={S.skelCard}>
                                    <View style={S.skelCover} />
                                    <View style={S.skelLine} />
                                    <View style={[S.skelLine, { width: '55%' }]} />
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={S.grid}>
                            {browseManga.map((manga, i) => {
                                const img = getProxied(manga);
                                const isAS = manga.source === 'asura';
                                return (
                                    <Pressable
                                        key={`${manga.id}-${i}`}
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
                                            <View style={[S.gridBadge, {
                                                backgroundColor: isAS ? C.asuraBg
                                                    : manga.source === 'mgeko' ? 'rgba(52,211,153,0.80)'
                                                        : C.mpBg,
                                            }]}>
                                                <Text style={S.gridBadgeText}>
                                                    {isAS ? 'AS' : manga.source === 'mgeko' ? 'MG' : 'MP'}
                                                </Text>
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
                    transform: [{ translateY: overlayAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
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
                                    : query.length > 0 && (
                                    <Pressable onPress={() => setQuery('')} hitSlop={8}>
                                        <Ionicons name="close-circle" size={16} color={C.text3} />
                                    </Pressable>
                                )
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
                                    keyExtractor={(item, i) => `${item?.id || i}-${item.source}`}
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
                                                    : <View style={[S.resCover, { backgroundColor: C.bg3, alignItems: 'center', justifyContent: 'center' }]}>
                                                        <Ionicons name="book-outline" size={18} color={C.text3} />
                                                    </View>
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
        width: 108, height: 154, borderRadius: 10, overflow: 'hidden',
        backgroundColor: '#2a2a35', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
        marginBottom: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
    },
    contCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    contCoverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
    contCoverEmptyText: { fontSize: 9, color: C.text3, fontWeight: '600', letterSpacing: 0.3 },
    contGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, backgroundColor: 'rgba(7,7,10,0.65)' },
    srcDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },

    contChBtn: {
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.accent,
        borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, marginBottom: 7,
        shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6,
    },
    contChBtnNew: {
        backgroundColor: C.green,
        shadowColor: C.green,
    },
    contChText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.1 },

    caughtUpBox: {
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: C.greenBorder, backgroundColor: C.greenDim,
        borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, marginBottom: 7,
    },
    caughtUpText: { color: C.green, fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },

    contTitle: { fontSize: 11, fontWeight: '600', color: C.text2, lineHeight: 15 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10 },
    gridCard: { width: '30.5%', marginBottom: 14 },
    gridCoverWrap: {
        width: '100%', aspectRatio: 0.68, borderRadius: 9, overflow: 'hidden',
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