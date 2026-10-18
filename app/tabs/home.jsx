import React, { useState, useCallback, useRef } from 'react';
import {
    SafeAreaView, View, Text, StyleSheet, Image, Pressable,
    TextInput, FlatList, ActivityIndicator, ScrollView,
    Animated, StatusBar, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { syncLibraryOnce, stopLibrarySync } from '../../services/accountSync';
import {
    getRecentSearches, saveRecentSearches, getFavorites,
    getLastReadChapterInfo, getLatestChapter, saveLatestChapter,
    getHiddenContinueReading, hideFromContinueReading,
    newChapterKey, getLastViewed,
} from '../searchStorage';
import { searchHardcodedManhwa } from '../../manga_api/hardcodedManhwas';
import { discoverCatalog, mergeCatalogItems } from '../../services/catalog';
import { searchMangapill, getMangapillManga, proxied as proxiedMangapill, unwrapImageProxyUrl } from '../../manga_api/mangapill';
import { findMangapillMatch } from '../../services/mangapillMatch';
import { proxied as proxiedAsura } from '../../manga_api/asurascans';
import { proxied as proxiedMgeko } from '../../manga_api/mgeko';
import {
    searchMangadex, getMangadexManga, proxied as proxiedMangadex,
    toMangadexChapterKey,
} from '../../manga_api/mangadex';
import { getCoverUrl } from "../../services/coverurls";

const C = {
    bg0:'#07070a', bg1:'#0c0c10', bg2:'#111118', bg3:'#18181f', bg4:'#1f1f28',
    border:'rgba(255,255,255,0.06)', borderMid:'rgba(255,255,255,0.10)',
    text1:'#eeedf0', text2:'#7c7b88', text3:'#38373f',
    accent:'#7c6af5', accentBright:'#9d8fff',
    accentDim:'rgba(124,106,245,0.14)', accentBorder:'rgba(124,106,245,0.28)',
    green:'#34d399', greenDim:'rgba(52,211,153,0.10)', greenBorder:'rgba(52,211,153,0.25)',
    asuraBg:'rgba(124,106,245,0.82)', mpBg:'rgba(56,189,248,0.78)', mdBg:'rgba(251,146,60,0.82)',
};

const LIVE_DELAY_MS = 300;
const CACHE_VERSION = 'v3';
const BACKEND = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');

const BATCH_SIZE = 5;
const BATCH_GAP_MS = 1200;
const STALE_AFTER_MS = 15 * 1000;

function chapterNum(id) {
    const s = String(id ?? '');
    const slug = s.includes('/') ? (s.split('/').filter(Boolean).pop() || s) : s;
    const m = slug.match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

function extractNewest(chapters) {
    if (!chapters?.length) return null;
    const withNums = chapters.map(ch => {
        const key = ch?.id ?? ch?.url ?? '';
        return { ch, num: chapterNum(key) ?? -1 };
    });
    withNums.sort((a, b) => b.num - a.num);
    const best = withNums[0]?.ch;
    return best ? (best.id ?? best.url ?? null) : null;
}

async function fetchLatestChapterId(key, source) {
    try {
        if (source === 'mangapill') {
            const mangapillUrl = key.includes('mangapill.com')
                ? key
                : `https://mangapill.com/manga/${key.replace('__', '/')}`;
            const data = await getMangapillManga(mangapillUrl);
            return extractNewest(data?.chapters);
        }
        if (source === 'mangadex') {
            const data = await getMangadexManga(key);
            const chs = data?.chapters || [];
            if (!chs.length) return null;
            const newest = chs[chs.length - 1];
            return toMangadexChapterKey(newest.chapter, newest.id);
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

function resolveCardState(manga) {
    const { lastReadChapter, latestChapter, hasNewChapterFlag, wasCaughtUpWhenNew } = manga;

    if (!lastReadChapter) return { state: 'IN_PROGRESS' };

    const readNum   = chapterNum(lastReadChapter);
    const latestNum = chapterNum(latestChapter);

    const exactMatch = latestChapter && String(lastReadChapter) === String(latestChapter);
    const numMatch   = readNum !== null && latestNum !== null && readNum >= latestNum;

    if (exactMatch || numMatch) return { state: 'CAUGHT_UP' };

    if (latestChapter && hasNewChapterFlag && wasCaughtUpWhenNew) {
        // Only jump the "continue" target ahead — and show the green "new"
        // treatment — if the reader was fully caught up at the moment this
        // chapter dropped. Otherwise it's visually and functionally
        // identical to normal IN_PROGRESS: purple, pointed at their real
        // last-read chapter.
        return { state: 'NEW_CHAPTER' };
    }

    return { state: 'IN_PROGRESS' };
}

const DiscoveryCard = React.memo(function DiscoveryCard({ manga, imageUri, width, checking, onOpen }) {
    const coverSource = React.useMemo(() => imageUri ? { uri: imageUri, cache: 'force-cache' } : null, [imageUri]);
    const source = manga.source;
    const badge = source === 'asura' ? 'AS' : source === 'mgeko' ? 'MG' : source === 'mangadex' ? 'MD' : 'MP';
    const color = source === 'asura' ? C.asuraBg : source === 'mgeko' ? 'rgba(52,211,153,0.80)' : source === 'mangadex' ? C.mdBg : C.mpBg;
    return (
        <Pressable
            style={({ pressed }) => [S.gridCard, { width, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
            onPress={() => onOpen(manga)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${manga.title}`}
        >
            <View style={S.gridCoverWrap}>
                {coverSource
                    ? <Image source={coverSource} style={S.gridCover} resizeMode="cover" />
                    : <View style={S.gridCoverEmpty}><Ionicons name="book-outline" size={20} color={C.text3} /></View>}
                {!!imageUri && <View style={S.gridGradient} />}
                <View style={[S.gridBadge, { backgroundColor: color }]}>
                    <Text style={S.gridBadgeText}>{badge}</Text>
                </View>
            </View>
            <Text style={S.gridTitle} numberOfLines={2}>{manga.title}</Text>
            {checking && <Text style={S.sourceSearching}>Checking MangaPill…</Text>}
        </Pressable>
    );
});

export default function Home() {
    const { width: viewportWidth } = useWindowDimensions();
    const contentWidth = Math.min(viewportWidth, 1280);
    const gridPadding = viewportWidth >= 700 ? 32 : 18;
    const gridGap = viewportWidth >= 700 ? 18 : 12;
    const columns = Math.max(2, Math.min(7, Math.floor((contentWidth - gridPadding * 2 + gridGap) / 166)));
    const tileWidth = Math.max(0, (contentWidth - gridPadding * 2 - gridGap * (columns - 1)) / columns);
    const [query, setQuery] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [followedManga, setFollowedManga] = useState([]);
    const [browseManga, setBrowseManga] = useState([]);
    const [catalogGenre, setCatalogGenre] = useState('All');
    const [catalogSort, setCatalogSort] = useState('default');
    const catalogGenres = ['All', 'Action', 'Fantasy', 'Romance', 'Comedy', 'Adventure', 'Martial Arts', 'Drama'];
    const filteredBrowse = browseManga
        .filter(item => catalogGenre === 'All' ||
            (Array.isArray(item.genres) && item.genres.some(g => String(g).toLowerCase() === catalogGenre.toLowerCase())));
    if (catalogSort === 'az') filteredBrowse.sort((a, b) => a.title.localeCompare(b.title));
    if (catalogSort === 'za') filteredBrowse.sort((a, b) => b.title.localeCompare(a.title));
    // Group titles into virtualized rows so the carousel and hero remain above the grid.
    const discoveryRows = [];
    for (let i = 0; i < filteredBrowse.length; i += columns) discoveryRows.push(filteredBrowse.slice(i, i + columns));
    const [loadingBrowse, setLoadingBrowse] = useState(false);
    const [loadingMoreBrowse, setLoadingMoreBrowse] = useState(false);
    const [browseOffset, setBrowseOffset] = useState(0);
    const [browseHasMore, setBrowseHasMore] = useState(true);
    const [browseError, setBrowseError] = useState('');
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [openingTitle, setOpeningTitle] = useState(null);

    const overlayAnim = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const cacheRef = useRef(new Map());
    const timerRef = useRef(null);
    const abortRef = useRef(null);
    const searchInputRef = useRef(null);
    const bgCancelledRef = useRef(false);
    const paginationInFlightRef = useRef(false);
    const hasScrolledRef = useRef(false);

    const getSource = (m) => {
        const id = String(m.url || m.id || '');
        // Id-prefix checks are authoritative and go first — they can't be
        // stale, unlike a stored `source` field that may have been written
        // before mgeko/mangadex support existed (or mis-defaulted to
        // 'mangapill' by an older heuristic). This lets legacy favorites
        // self-heal on next render instead of needing a data migration.
        if (id.startsWith('mangadex__')) return 'mangadex';
        if (id.startsWith('mgeko__')) return 'mgeko';
        if (m.source) return m.source;
        if (/^\d+__/.test(id)) return 'mangapill';
        if (id.includes('mangapill.com')) return 'mangapill';
        if (id.includes('/') || id.includes('http')) return 'mangapill';
        return 'asura';
    };

    const loadFollowedManga = useCallback(async () => {
        const [favs, hiddenCards] = await Promise.all([getFavorites(), getHiddenContinueReading()]);

        const withProgress = await Promise.all(
            favs.map(async f => {
                const key = f.url;
                const info = await getLastReadChapterInfo(key);
                if (!info?.chapterUrl) return null;
                if (hiddenCards[key] && Number(hiddenCards[key]) >= (info.timestamp || 0)) return null;

                const latestChapter = await getLatestChapter(key);

                let newChapterAt = null;
                let wasCaughtUpWhenNew = false;
                try {
                    const raw = await AsyncStorage.getItem(newChapterKey(key));
                    if (raw) {
                        try {
                            // Current format: JSON payload with catch-up context.
                            const parsed = JSON.parse(raw);
                            newChapterAt = parsed?.ts ?? null;
                            wasCaughtUpWhenNew = !!parsed?.wasCaughtUp;
                        } catch {
                            // Legacy format: a bare timestamp string. We don't know
                            // the catch-up context for these, so default to the
                            // conservative option (don't jump the target ahead).
                            newChapterAt = parseInt(raw);
                            wasCaughtUpWhenNew = false;
                        }
                    }
                } catch { /* ignore */ }

                const lastViewedAt = await getLastViewed(key);

                return {
                    ...f,
                    lastReadChapter: info.chapterUrl,
                    lastReadTimestamp: info.timestamp || 0,
                    latestChapter: latestChapter ?? null,
                    hasNewChapterFlag: newChapterAt != null,
                    wasCaughtUpWhenNew,
                    sortPriority: Math.max(newChapterAt ?? 0, info.timestamp ?? 0, lastViewedAt ?? 0),
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

            const isGenuinelyNew = !!stored;

            // Was the reader caught up to the *old* latest chapter right before
            // this new one appeared? Only then is it safe to point the
            // "continue" button at the newest chapter — otherwise they'd skip
            // past whatever backlog they still had.
            const oldLatestNum = chapterNum(stored);
            const readNum = chapterNum(manga.lastReadChapter);
            const wasCaughtUp = oldLatestNum !== null && readNum !== null && readNum >= oldLatestNum;

            await saveLatestChapter(key, latestId);
            if (isGenuinelyNew) {
                await AsyncStorage.setItem(
                    newChapterKey(key),
                    JSON.stringify({ ts: now, wasCaughtUp })
                ).catch(() => {});
            }

            setFollowedManga(prev => {
                const idx = prev.findIndex(m => m.url === key);
                if (idx < 0) return prev;
                const patched = {
                    ...prev[idx],
                    latestChapter: latestId,
                    hasNewChapterFlag: isGenuinelyNew ? true : prev[idx].hasNewChapterFlag,
                    wasCaughtUpWhenNew: isGenuinelyNew ? wasCaughtUp : prev[idx].wasCaughtUpWhenNew,
                    sortPriority: isGenuinelyNew ? now : prev[idx].sortPriority,
                };
                return [patched, ...prev.filter((_, i) => i !== idx)];
            });
        });

        await runBatched(tasks, BATCH_SIZE, BATCH_GAP_MS, bgCancelledRef);
    }, []);

    useFocusEffect(
        useCallback(() => {
            bgCancelledRef.current = false;
            (async () => {
                await syncLibraryOnce().catch(() => {});
                if (bgCancelledRef.current) return;
                setRecentSearches(await getRecentSearches());
                const series = await loadFollowedManga();
                runBackgroundFetch(series);
            })();
            return () => { bgCancelledRef.current = true; };
        }, [loadFollowedManga, runBackgroundFetch])
    );

    React.useEffect(() => {
        let active = true;
        (async () => {
            setLoadingBrowse(true);
            setBrowseError('');
            try {
                const titles = await discoverCatalog({ limit: 24 });
                if (active) {
                    console.info('Home catalog loaded', { count: titles.length, mangadex: titles.filter(item => item.source === 'mangadex').length });
                    setBrowseManga(titles);
                    setBrowseOffset(24);
                    setBrowseHasMore(titles.filter(item => item.source === 'mangadex').length >= 24);
                }
            } catch (error) {
                if (active) {
                    setBrowseManga(searchHardcodedManhwa(''));
                    setBrowseError(`Live discovery failed: ${error?.message || 'unknown error'}`);
                }
            } finally {
                if (active) setLoadingBrowse(false);
            }
        })();
        return () => { active = false; };
    }, []);

    const loadMoreCatalog = async () => {
        if (paginationInFlightRef.current || loadingBrowse || !browseHasMore) return;
        paginationInFlightRef.current = true;
        setLoadingMoreBrowse(true);
        try {
            const titles = await searchMangadex('', 24, browseOffset);
            setBrowseManga(current => mergeCatalogItems(current, titles));
            setBrowseOffset(current => current + 24);
            setBrowseHasMore(titles.length === 24);
            setBrowseError('');
        } catch (error) {
            setBrowseError('Could not load more titles. Please try again.');
        } finally {
            paginationInFlightRef.current = false;
            setLoadingMoreBrowse(false);
        }
    };

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
                const [ar, mr, dr] = await Promise.all([
                    Promise.resolve(searchHardcodedManhwa(q)),
                    searchMangapill(q, 15).catch(() => []),
                    searchMangadex(q, 15).catch(() => []),
                ]);
                const score = i => {
                    const t = (i.title || '').toLowerCase();
                    return t === qL ? 1000 : t.startsWith(qL) ? 500 : t.includes(qL) ? 100 : 0;
                };
                const all = [
                    ...(ar || []).map(i => ({ ...i, source: i.source || 'asura' })),
                    ...(mr || []).map(i => ({ ...i, source: 'mangapill', id: i.url })),
                    ...(dr || []).map(i => ({ ...i, source: 'mangadex' })),
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

    // Keep cover URLs stable across updates, without holding an unbounded catalog cache.
    const coverUrlCacheRef = useRef(new Map());
    const getProxied = (item) => {
        const url = unwrapImageProxyUrl(getCoverUrl(item.id) || getCoverUrl(item.url) || item.cover || item.coverUrl);
        if (!url) return null;
        const src = item.source || getSource(item);
        const key = `${src}:${url}`;
        const cache = coverUrlCacheRef.current;
        if (cache.has(key)) return cache.get(key);
        const resolved = src === 'mangapill' ? proxiedMangapill(url)
            : src === 'mangadex' ? proxiedMangadex(url)
                : src === 'mgeko' ? proxiedMgeko(url)
                    : proxiedAsura(url);
        if (cache.size >= 500) cache.clear();
        cache.set(key, resolved);
        return resolved;
    };

    const openManga = async (item) => {
        const src = item.source || getSource(item);
        const id = item.id || item.url;
        const titleParam = item.title ? `&title=${encodeURIComponent(item.title)}` : '';
        if (src === 'mangadex' && item.title) {
            setOpeningTitle(String(id));
            try {
                const match = await findMangapillMatch(item.title, searchMangapill);
                if (match) {
                    router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(match.url)}&source=mangapill${titleParam}`);
                    return;
                }
            } catch (error) {
                console.warn('MangaPill lookup unavailable; falling back to MangaDex', error);
            } finally {
                setOpeningTitle(null);
            }
        }
        if (src === 'asura' || src === 'mgeko' || src === 'mangadex') {
            router.push(`/MangaDetails?seriesId=${encodeURIComponent(id)}&source=${src}${titleParam}`);
        } else {
            const mangapillUrl = id.includes('mangapill.com')
                ? id
                : `https://mangapill.com/manga/${id.replace('__', '/')}`;
            router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill${titleParam}`);
        }
    };

    const openCardRef = useRef(null);
    openCardRef.current = openManga;
    const openDiscoveryCard = useCallback(item => openCardRef.current?.(item), []);

    const openResult = async (item) => {
        await handleAddSearch(item?.title || query);
        closeSearch();
        openManga(item);
    };

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

    const openLastRead = (manga) => openChapter(manga, manga.lastReadChapter);

    const dismissContinueCard = async (manga) => {
        if (!manga?.url) return;
        try {
            await hideFromContinueReading(manga.url);
            setFollowedManga(current => current.filter(item => item.url !== manga.url));
        } catch (error) {
            console.warn('Failed to hide Continue Reading title', error);
        }
    };

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
                        {viewportWidth >= 900 && <View style={S.desktopNav}>
                            <Pressable style={S.desktopNavActive} onPress={() => router.push("/tabs/home")}><Text style={S.desktopNavActiveText}>Discover</Text></Pressable>
                            <Pressable style={S.desktopNavItem} onPress={() => router.push("/tabs/favorites")}><Text style={S.desktopNavText}>My List</Text></Pressable>
                        </View>}
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
                            setDropdownVisible(false); stopLibrarySync(); await signOut(); router.replace('/login');
                        }}>
                            <Ionicons name="log-out-outline" size={14} color={C.accent} />
                            <Text style={[S.ddText, { color: C.accent }]}>Sign Out</Text>
                        </Pressable>
                    </View>
                </>
            )}

            <FlatList
                style={S.scroll}
                contentContainerStyle={S.scrollContent}
                data={discoveryRows}
                keyExtractor={(row, index) => `row:${row[0]?.source || 'unknown'}:${row[0]?.id || row[0]?.url || index}`}
                renderItem={({ item: row }) => (
                    <View style={[S.gridRow, { paddingHorizontal: gridPadding, columnGap: gridGap }]}>
                        {row.map((manga, i) => (
                            <DiscoveryCard
                                key={`${manga.source || 'unknown'}:${manga.id || manga.url || i}`}
                                manga={manga}
                                imageUri={getProxied(manga)}
                                width={tileWidth}
                                checking={openingTitle === String(manga.id)}
                                onOpen={openDiscoveryCard}
                            />
                        ))}
                    </View>
                )}
                initialNumToRender={6}
                maxToRenderPerBatch={6}
                windowSize={7}
                removeClippedSubviews={false}
                onScroll={event => { if (event.nativeEvent.contentOffset.y > 80) hasScrolledRef.current = true; }}
                scrollEventThrottle={200}
                onEndReachedThreshold={0.8}
                onEndReached={() => {
                    if (hasScrolledRef.current && !loadingBrowse && !loadingMoreBrowse && browseHasMore && !browseError) loadMoreCatalog();
                }}
                ListHeaderComponent={
                    <>

                <View style={[S.hero, followedManga.length > 0 && S.heroCompact]}>
                    <View style={S.heroGlow} />
                    <Text style={S.heroEyebrow}>YOUR LIBRARY, YOUR NEXT ADVENTURE</Text>
                    <Text style={[S.heroTitle, followedManga.length > 0 && S.heroCompactTitle]}>{followedManga.length > 0 ? "Ready for another chapter?" : "Discover something worth reading."}</Text>
                    <Text style={S.heroDescription}>{followedManga.length > 0 ? "Your stories are waiting below. Or find your next favorite." : "Explore manga and manhwa, keep your place, and pick up right where you left off."}</Text>
                    <Pressable style={S.heroAction} onPress={openSearch} accessibilityRole="button" accessibilityLabel="Search manga and manhwa">
                        <Ionicons name="search-outline" size={17} color="#fff" />
                        <Text style={S.heroActionText}>Find a story</Text>
                        <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </Pressable>
                </View>

                {/* CONTINUE READING */}
                {followedManga.length > 0 && (
                    <View style={S.section}>
                        <View style={S.sectionHead}>
                            <Text style={S.sectionTitle}>Continue Reading</Text>
                            <Pressable onPress={() => router.push('/tabs/favorites')} style={S.seeAllBtn}>
                                <Text style={S.seeAllText}>See All</Text>
                                <Ionicons name="chevron-forward" size={12} color={C.accentBright} />
                            </Pressable>
                        </View>
                        <Text style={S.sectionHint}>Jump back into your stories · Hide a title without losing progress</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.hList}>
                            {followedManga.map((manga, i) => {
                                const img = getProxied(manga);
                                const src = getSource(manga);
                                const { state } = resolveCardState(manga);

                                return (
                                    <View key={`${manga.url}-${i}`} style={[S.contCard, viewportWidth >= 700 && S.contCardDesktop]}>
                                        <Pressable
                                            style={({ pressed }) => [S.contCoverWrap, viewportWidth >= 700 && S.contCoverDesktop, { opacity: pressed ? 0.75 : 1 }]}
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
                                                        : src === 'mangadex' ? C.mdBg
                                                            : C.mpBg,
                                            }]} />
                                        </Pressable>

                                        <Pressable
                                            style={S.hideCardButton}
                                            onPress={() => dismissContinueCard(manga)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Hide ${manga.title} from Continue Reading`}
                                            hitSlop={8}
                                        >
                                            <Ionicons name="close" size={15} color={C.text1} />
                                        </Pressable>

                                        {state === 'CAUGHT_UP' ? (
                                            <View style={S.caughtUpBox}>
                                                <Text style={S.caughtUpText}>Up to date</Text>
                                            </View>
                                        ) : state === 'NEW_CHAPTER' ? (
                                            // Reader was fully caught up right before this chapter
                                            // dropped — green box, jump straight to it.
                                            <Pressable
                                                style={({ pressed }) => [S.contChBtn, S.contChBtnNew, { opacity: pressed ? 0.75 : 1 }]}
                                                onPress={() => openChapter(manga, manga.latestChapter)}
                                            >
                                                <Text style={S.contChText} numberOfLines={1}>
                                                    {fmtCh(manga.latestChapter, src)}
                                                </Text>
                                            </Pressable>
                                        ) : (
                                            // Still has a backlog (whether or not something new also
                                            // dropped) — plain purple, points at their real progress.
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

                {/* DISCOVERY */}
                <View style={S.section}>
                    <View style={S.sectionHead}>
                        <View style={{ flex: 1, gap: 4 }}><Text style={S.sectionTitle}>Explore Manga & Manhwa</Text><Text style={S.sectionSubtitle}>Browse sources, genres, and titles</Text></View>
                        <View style={S.liveBadge}>
                            <View style={S.liveDot} />
                            <Text style={S.liveText}>DISCOVER</Text>
                        </View>
                    </View>
                </View>
                    <View style={{ paddingHorizontal: gridPadding, marginBottom: 20, gap: 12 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                            {catalogGenres.map(genre => {
                                const active = catalogGenre === genre;
                                return <Pressable key={genre} accessibilityRole="button"
                                    accessibilityState={{ selected: active }} onPress={() => { setCatalogGenre(genre); hasScrolledRef.current = false; }}
                                    style={{ backgroundColor: active ? C.accentDim : C.bg2, borderColor: active ? C.accentBorder : C.border, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                                    <Text style={{ color: active ? C.accentBright : C.text2, fontSize: 12, fontWeight: '600' }}>{genre}</Text>
                                </Pressable>;
                            })}
                        </ScrollView>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                            <Text style={{ color: C.text2, fontSize: 12 }}>{filteredBrowse.length} matching titles from {browseManga.length} loaded</Text>
                            <Pressable accessibilityRole="button" onPress={() => setCatalogSort(current => current === 'default' ? 'az' : current === 'az' ? 'za' : 'default')}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
                                <Ionicons name="swap-vertical-outline" size={16} color={C.accentBright} />
                                <Text style={{ color: C.accentBright, fontSize: 12, fontWeight: '700' }}>{catalogSort === 'az' ? 'Title A–Z' : catalogSort === 'za' ? 'Title Z–A' : 'Default order'}</Text>
                            </Pressable>
                        </View>
                    </View>
                    {loadingBrowse && (
                        <View style={[S.grid, { paddingHorizontal: gridPadding, columnGap: gridGap }]}>
                            {[...Array(columns * 2)].map((_, i) => (
                                <View key={i} style={[S.skelCard, { width: tileWidth }]}>
                                    <View style={S.skelCover} />
                                    <View style={S.skelLine} />
                                    <View style={[S.skelLine, { width: '55%' }]} />
                                </View>
                            ))}
                        </View>
                    )}
                    </>
                }
                ListFooterComponent={
                    <View style={S.browseFooter}>
                    {!loadingBrowse && browseManga.length > 0 && filteredBrowse.length === 0 && (
                        <View style={{ padding: 24, alignItems: 'center', gap: 10 }}>
                            <Text style={{ color: C.text1, fontWeight: '700' }}>No matches in loaded titles</Text>
                            <Text style={{ color: C.text2, textAlign: 'center' }}>Try another source or genre, or load more titles.</Text>
                            <Pressable onPress={() => setCatalogGenre('All')} accessibilityRole="button">
                                <Text style={{ color: C.accentBright, fontWeight: '700' }}>Clear filters</Text>
                            </Pressable>
                        </View>
                    )}
                    {!loadingBrowse && browseManga.length === 0 && (
                        <View style={{ marginHorizontal: 18, padding: 20, backgroundColor: C.bg2, borderRadius: 12 }}>
                            <Text style={{ color: C.text1, fontWeight: '700', marginBottom: 6 }}>No titles loaded</Text>
                            <Text style={{ color: C.text2, lineHeight: 19 }}>
                                Check EXPO_PUBLIC_CHAPTERS_API and the MangaDex API response in your browser's Network tab.
                            </Text>
                        </View>
                    )}
                    {!!browseError && (
                        <Text style={{ color: C.text2, marginHorizontal: 18, marginTop: 12 }}>{browseError}</Text>
                    )}
                    {loadingMoreBrowse && (
                        <View style={S.paginationStatus}>
                            <ActivityIndicator size="small" color={C.accentBright} />
                            <Text style={S.paginationText}>Discovering more titles…</Text>
                        </View>
                    )}
                    {!browseHasMore && !loadingBrowse && browseManga.length > 0 && (
                        <Text style={S.paginationText}>You're all caught up.</Text>
                    )}
                    {!!browseError && browseHasMore && !loadingMoreBrowse && (
                        <Pressable onPress={loadMoreCatalog} style={S.retryBtn} accessibilityRole="button">
                            <Text style={S.loadMoreText}>Retry loading titles</Text>
                        </Pressable>
                    )}
                    </View>
                }
            />

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
                                        const isMD = item.source === 'mangadex';
                                        const badgeColor = isAS ? C.accentDim : isMD ? 'rgba(251,146,60,0.14)' : 'rgba(56,189,248,0.12)';
                                        const badgeTextColor = isAS ? C.accentBright : isMD ? '#fb923c' : '#7dd3fc';
                                        const badgeLabel = isAS ? 'AsuraScans' : isMD ? 'MangaDex' : 'MangaPill';
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
                                                    <View style={[S.resBadge, { backgroundColor: badgeColor }]}>
                                                        <Text style={[S.resBadgeText, { color: badgeTextColor }]}>
                                                            {badgeLabel}
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
    headerRight: { flexDirection: 'row', gap: 2, alignItems: 'center' },
    desktopNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 18 },
    desktopNavActive: { paddingVertical: 9, paddingHorizontal: 16, backgroundColor: C.accentDim, borderRadius: 10 },
    desktopNavActiveText: { color: C.accentBright, fontSize: 13, fontWeight: '800' },
    desktopNavItem: { paddingVertical: 9, paddingHorizontal: 16 },
    desktopNavText: { color: C.text2, fontSize: 13, fontWeight: '700' },
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
    scrollContent: { paddingBottom: 52, maxWidth: 1280, width: '100%', alignSelf: 'center' },
    hero: { marginHorizontal: 18, marginTop: 22, paddingHorizontal: 25, paddingVertical: 30, backgroundColor: '#1b1731', borderColor: 'rgba(157,143,255,0.19)', borderWidth: 1, borderRadius: 20, overflow: 'hidden', gap: 10 },
    heroCompact: { paddingVertical: 18, gap: 7 },
    heroCompactTitle: { fontSize: 24, lineHeight: 30 },
    heroGlow: { position: 'absolute', top: -110, right: -120, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(124,106,245,0.23)' },
    heroEyebrow: { color: '#afa4ff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    heroTitle: { color: '#faf9ff', fontSize: 30, fontWeight: '800', letterSpacing: -1, lineHeight: 35, maxWidth: 500 },
    heroDescription: { color: '#b4afc6', fontSize: 13, lineHeight: 20, maxWidth: 470 },
    heroAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, backgroundColor: '#735bf0', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
    heroActionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    section: { paddingTop: 32 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14 },
    sectionTitle: { fontSize: 19, fontWeight: '800', color: C.text1, letterSpacing: -0.4 },
    sectionSubtitle: { fontSize: 12, color: C.text2 },
    sourceSearching: { fontSize: 10, color: C.accentBright, marginTop: 4 },
    seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    seeAllText: { fontSize: 12, fontWeight: '600', color: C.accentBright },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentDim, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
    liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.accent },
    liveText: { fontSize: 9, fontWeight: '800', color: C.accentBright, letterSpacing: 1 },

    paginationStatus: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 26 },
    paginationText: { color: C.text2, fontSize: 12, textAlign: 'center', marginVertical: 12 },
    retryBtn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18, marginVertical: 12, borderRadius: 10, backgroundColor: C.bg3 },
    loadMoreBtn: { alignSelf: 'center', marginVertical: 20, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.borderMid },
    loadMoreText: { color: C.accentBright, fontWeight: '700', fontSize: 13 },
    hList: { paddingHorizontal: 18, gap: 14, paddingRight: 30, paddingBottom: 8 },
    sectionHint: { color: C.text2, fontSize: 11, marginHorizontal: 18, marginBottom: 12 },
    hideCardButton: { position: 'absolute', top: 7, left: 7, zIndex: 2, width: 25, height: 25, borderRadius: 13, backgroundColor: 'rgba(7,7,10,0.88)', borderWidth: 1, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center' },
    contCard: { width: 118 },
    contCardDesktop: { width: 138 },
    contCoverDesktop: { width: 138, height: 192 },
    contCoverWrap: {
        width: 118, height: 167, borderRadius: 12, overflow: 'hidden',
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
        minHeight: 30,
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
        minHeight: 30,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: C.greenBorder, backgroundColor: C.greenDim,
        borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6, marginBottom: 7,
    },
    caughtUpText: { color: C.green, fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },

    contTitle: { fontSize: 12, fontWeight: '700', color: '#d3d0dd', lineHeight: 17 },

    browseFooter: { paddingBottom: 24 },
    gridRow: { flexDirection: 'row', marginBottom: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 21 },
    gridCard: { minWidth: 0, marginBottom: 2 },
    gridCoverWrap: {
        width: '100%', aspectRatio: 0.68, borderRadius: 13, overflow: 'hidden',
        backgroundColor: C.bg3, marginBottom: 7,
        shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 7,
    },
    gridCover: { width: '100%', height: '100%' },
    gridCoverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg3 },
    gridGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, backgroundColor: 'rgba(7,7,10,0.5)' },
    gridBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    gridBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
    gridTitle: { fontSize: 12, fontWeight: '700', color: '#dedce7', lineHeight: 17, marginTop: 4 },

    skelCard: { marginBottom: 14 },
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