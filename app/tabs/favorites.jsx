import React, { useEffect, useState, useCallback } from "react";
import SourceCover, { coverSources } from "../../components/SourceCover";
import {
    View, Text, FlatList, Pressable, StyleSheet,
    Image, SafeAreaView, RefreshControl, StatusBar, Modal,
    TouchableOpacity, TextInput, ScrollView, useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { queueLibrarySync, syncLibraryOnce } from "../../services/accountSync";
import { getFavorites, getLastReadChapterInfo, removeFavorite } from "../searchStorage";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser } from '../../auth/cognito';
import { proxied as proxiedAsura } from '../../manga_api/asurascans';
import { proxied as proxiedMangapill } from '../../manga_api/mangapill';
import { proxied as proxiedMgeko } from '../../manga_api/mgeko';
import { proxied as proxiedMangadex, splitMangadexChapterKey } from '../../manga_api/mangadex';
import { getCoverUrl as getStaticCover } from "../../services/coverurls";
import { sourceSelectionKey, sourceDetailPath } from "../../services/sourceOptions";

const C = {
    bg0:'#07070a', bg1:'#0c0c10', bg2:'#111118', bg3:'#18181f', bg4:'#1f1f28',
    border:'rgba(255,255,255,0.06)', borderMid:'rgba(255,255,255,0.10)',
    text1:'#eeedf0', text2:'#7c7b88', text3:'#38373f',
    accent:'#7c6af5', accentBright:'#9d8fff',
    accentDim:'rgba(124,106,245,0.14)', accentBorder:'rgba(124,106,245,0.28)',
    green:'#34d399', greenDim:'rgba(52,211,153,0.10)', greenBorder:'rgba(52,211,153,0.25)',
    asuraBg:'rgba(124,106,245,0.82)', mpBg:'rgba(56,189,248,0.78)',
    mgekoBg:'rgba(52,211,153,0.82)', mdBg:'rgba(251,146,60,0.82)',
    danger:'#f87171',
    yellow:'#fbbf24',
};

// Status config — color + icon
const STATUS_CONFIG = {
    'Reading':      { color: C.accentBright, icon: 'play-circle',       dim: C.accentDim,   border: C.accentBorder },
    'Completed':    { color: C.green,        icon: 'checkmark-circle',  dim: C.greenDim,    border: C.greenBorder },
    'On Hold':      { color: C.yellow,       icon: 'pause-circle',      dim: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.28)' },
    'Hiatus':       { color: '#f97316',      icon: 'time',              dim: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.28)' },
    'Plan to Read': { color: C.text2,        icon: 'bookmark',          dim: 'rgba(124,123,136,0.12)', border: 'rgba(124,123,136,0.25)' },
};
const STATUS_OPTIONS = Object.keys(STATUS_CONFIG);

// Sort order — completed goes last
const STATUS_ORDER = { 'Reading': 0, 'Plan to Read': 1, 'On Hold': 2, 'Hiatus': 3, 'Completed': 4 };

export default function Favorites() {
    const [favorites, setFavorites] = useState([]);
    const [isGuest, setIsGuest] = useState(false);
    const [libraryQuery, setLibraryQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [sortBy, setSortBy] = useState('recent');
    const { width: viewportWidth } = useWindowDimensions();
    const [lastReadInfo, setLastReadInfo] = useState({});
    const [statusMap, setStatusMap] = useState({});       // url -> status string
    const [chapterCounts, setChapterCounts] = useState({}); // url -> total chapters from storage
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusPickerFor, setStatusPickerFor] = useState(null); // url of item being edited
    const router = useRouter();

    useFocusEffect(useCallback(() => {
        let current = true;
        (async () => {
            const user = await getCurrentUser();
            if (!current) return;
            if (!user) {
                setIsGuest(true);
                setFavorites([]);
                setLastReadInfo({});
                setStatusMap({});
                setChapterCounts({});
                setLoading(false);
                return;
            }
            setIsGuest(false);
            await syncLibraryOnce().catch(() => {});
            if (current) await load();
        })().catch(() => { if (current) { setIsGuest(true); setFavorites([]); setLoading(false); } });
        return () => { current = false; };
    }, []));

    const load = async () => {
        try {
            const list = await getFavorites();

            // Read statuses and chapter counts in one storage round-trip.
            const keys = list.flatMap(f => [`status:${f.url}`, `chapterCount:${f.url}`]);
            const storedEntries = keys.length ? await AsyncStorage.multiGet(keys) : [];
            const storedMap = new Map(storedEntries);
            const sMap = {};
            const ccMap = {};
            for (const f of list) {
                sMap[f.url] = storedMap.get(`status:${f.url}`) || 'Reading';
                const count = Number.parseInt(storedMap.get(`chapterCount:${f.url}`), 10);
                if (Number.isFinite(count) && count > 0) ccMap[f.url] = count;
            }
            setStatusMap(sMap);
            setChapterCounts(ccMap);

            // Sort: non-completed first by status order, completed last
            const sorted = [...list].sort((a, b) => {
                const sa = STATUS_ORDER[sMap[a.url]] ?? 0;
                const sb = STATUS_ORDER[sMap[b.url]] ?? 0;
                return sa - sb;
            });
            setFavorites(sorted);

            // Limit concurrent progress reads rather than blocking once per title.
            const lrData = {};
            for (let i = 0; i < sorted.length; i += 16) {
                const batch = sorted.slice(i, i + 16);
                const results = await Promise.all(batch.map(async f => {
                    try { return await getLastReadChapterInfo(f.url); } catch { return null; }
                }));
                batch.forEach((f, index) => {
                    if (results[index]) lrData[f.url] = results[index];
                });
            }
            setLastReadInfo(lrData);
        } catch(e) { console.error(e); }
        finally { setLoading(false); setRefreshing(false); }
    };

    const onRefresh = () => { setRefreshing(true); load(); };
    const handleRemove = async (url) => {
        try { await removeFavorite(url); await load(); } catch(e) {}
    };

    const handleStatusChange = async (url, newStatus) => {
        setStatusPickerFor(null);
        await AsyncStorage.setItem(`status:${url}`, newStatus).catch(() => {});
        queueLibrarySync();
        // Re-sort immediately
        setStatusMap(prev => ({ ...prev, [url]: newStatus }));
        setFavorites(prev => [...prev].sort((a, b) => {
            const sa = STATUS_ORDER[a.url === url ? newStatus : (statusMap[a.url] || 'Reading')] ?? 0;
            const sb = STATUS_ORDER[b.url === url ? newStatus : (statusMap[b.url] || 'Reading')] ?? 0;
            return sa - sb;
        }));
    };

    const getSource = (item) => {
        const urlStr = String(item.url || '');
        // Id-prefix checks are authoritative and go first — they can't be
        // stale, unlike a stored `source` field that may have been written
        // before mgeko/mangadex support existed (or mis-defaulted to
        // 'mangapill' by an older heuristic). This lets legacy favorites
        // self-heal on next render instead of needing a data migration.
        if (urlStr.startsWith('mangadex__')) return 'mangadex';
        if (urlStr.startsWith('mgeko__')) return 'mgeko';
        if (item.source) return item.source;
        if (urlStr.includes('mangapill') || urlStr.includes('/') || urlStr.includes('http')) return 'mangapill';
        if (/^\d+__/.test(urlStr)) return 'mangapill';  // catches "5460__dandadan"
        return 'asura';
    };

    const getCoverCandidates = (item) => coverSources(
        item.image, item.coverUrl, item.cover, getStaticCover(item.url)
    );

    // Parse chapter number from a chapter id/url
    const parseChNum = (chUrl, src) => {
        if (!chUrl) return null;
        if (src === 'asura') { const n = parseFloat(chUrl); return isNaN(n) ? null : n; }
        if (src === 'mangadex') {
            // Composite "<chapterNumber>__<uuid>" key — see toMangadexChapterKey.
            const { number } = splitMangadexChapterKey(chUrl);
            const n = parseFloat(number);
            return isNaN(n) ? null : n;
        }
        const slug = String(chUrl).split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
        if (/^\d+(?:\.\d+)?$/.test(slug)) return Number(slug);
        // Never mistake digits in the manga title for a chapter number:
        // "yamada-kun-to-lv999-no-koi-wo-suru" is not chapter 999.
        const explicit = slug.match(/(?:^|[-_])(?:chapter|ch)[-_]?(\d+(?:\.\d+)?)(?:$|[-_])/i);
        if (explicit) return Number(explicit[1]);
        const trailing = slug.match(/[-_](\d+(?:\.\d+)?)$/);
        return trailing ? Number(trailing[1]) : null;
    };

    const fmtCh = (url, item) => {
        if (!url) return '—';
        const src = getSource(item);
        if (src === 'asura') return `Ch. ${url}`;
        if (src === 'mangadex') {
            const { number } = splitMangadexChapterKey(url);
            return number ? `Ch. ${number}` : 'Continue';
        }
        const num = parseChNum(url, src);
        return num !== null ? `Ch. ${num}` : 'Continue';
    };

    const timeSince = (ts) => {
        if (!ts) return '';
        const d = Math.floor((Date.now()-ts)/86400000), h = Math.floor((Date.now()-ts)/3600000);
        return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : 'Just now';
    };

    const openDetails = (item) => {
        const src = getSource(item);
        if (src === 'mangapill') {
            router.push(`/MangaDetails?mangapillUrl=${encodeURIComponent(item.url)}&source=mangapill`);
        } else {
            router.push(`/MangaDetails?seriesId=${encodeURIComponent(item.url)}&source=${src}`);
        }
    };

    const openContinue = async (item, lr) => {
        const src = getSource(item);
        if (item.title) {
            try {
                const raw = await AsyncStorage.getItem(sourceSelectionKey(item.title));
                const preferred = raw ? JSON.parse(raw) : null;
                if (preferred?.id && preferred?.source && preferred.source !== src) {
                    router.push(sourceDetailPath(preferred, item.title));
                    return;
                }
            } catch { /* Fall back to the existing saved chapter */ }
        }
        if (src === 'mangapill') {
            router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(lr.chapterUrl)}&mangapillUrl=${encodeURIComponent(item.url)}&source=mangapill`);
        } else {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(item.url)}&chapterId=${encodeURIComponent(lr.chapterUrl)}&source=${src}`);
        }
    };

    const desktopRows = viewportWidth >= 900;
    const twoColumns = viewportWidth >= 1180;

    const renderItem = ({ item }) => {
        const lr = lastReadInfo[item.url];
        const src = getSource(item);
        const isAS = src === 'asura';
        const badgeColor = src === 'asura' ? C.asuraBg
            : src === 'mgeko' ? C.mgekoBg
                : src === 'mangadex' ? C.mdBg
                    : C.mpBg;
        const badgeLabel = src === 'asura' ? 'AS'
            : src === 'mgeko' ? 'MG'
                : src === 'mangadex' ? 'MD'
                    : 'MP';
        const status = statusMap[item.url] || 'Reading';
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Reading'];
        const isCompleted = status === 'Completed';

        // Chapter progress
        const readChNum = lr ? parseChNum(lr.chapterUrl, src) : null;
        const totalCh = chapterCounts[item.url] || null;
        const hasProgress = readChNum !== null;
        const progressPercent = hasProgress && totalCh ? Math.min(100, Math.max(0, Math.round((readChNum / totalCh) * 100))) : null;
        const coverUrls = getCoverCandidates(item);

        return (
            <Pressable
                style={({ pressed }) => [S.card, desktopRows && S.cardDesktop, isCompleted && S.cardCompleted, { opacity: pressed ? 0.88 : 1 }]}
                onPress={() => openDetails(item)}
            >
                {/* Left accent bar — color = status color */}
                <View style={[S.cardBar, { backgroundColor: cfg.color }]} />

                {/* Cover — proxied through the correct source-specific proxy */}
                <View style={[S.coverWrap, desktopRows && S.coverWrapDesktop]}>
                    <SourceCover urls={coverUrls} seriesId={item.url} source={src}
                        style={[S.cover, desktopRows && S.coverDesktop, isCompleted && S.coverCompleted]}
                        placeholder={<View style={[S.cover, desktopRows && S.coverDesktop, S.coverEmpty]}>
                            <Ionicons name="book-outline" size={20} color={C.text3} />
                        </View>} />
                    <View style={[S.srcBadge, { backgroundColor: badgeColor }]}>
                        <Text style={S.srcText}>{badgeLabel}</Text>
                    </View>
                    {isCompleted && (
                        <View style={S.completedOverlay}>
                            <Ionicons name="checkmark-circle" size={22} color={C.green} />
                        </View>
                    )}
                </View>

                {/* Content */}
                <View style={[S.content, desktopRows && S.contentDesktop]}>

                    {/* Title + delete */}
                    <View style={S.titleRow}>
                        <Text style={[S.title, isCompleted && { color: C.text2 }]} numberOfLines={2}>{item.title}</Text>
                        {!desktopRows && <Pressable onPress={(e) => { e.stopPropagation?.(); handleRemove(item.url); }} style={S.delBtn} hitSlop={10}>
                            <Ionicons name="trash-outline" size={15} color={C.text3} />
                        </Pressable>}
                    </View>

                    {/* Chapter progress bar */}
                    {hasProgress && (
                        <View style={S.progressWrap}>
                            <View style={S.progressRow}>
                                <Text style={S.progressText}>
                                    {totalCh
                                        ? `${Math.round(readChNum)} / ${totalCh} ch`
                                        : `Ch. ${Math.round(readChNum)} read`
                                    }
                                </Text>
                                {progressPercent !== null && (
                                    <Text style={S.progressPct}>{progressPercent}%</Text>
                                )}
                            </View>
                            {totalCh && (
                                <View style={S.progressBar}>
                                    <View style={[S.progressFill, {
                                        width: `${progressPercent}%`,
                                        backgroundColor: cfg.color,
                                    }]} />
                                </View>
                            )}
                        </View>
                    )}

                    {!hasProgress && (
                        <Text style={S.notStartedText} numberOfLines={1}>
                            {isCompleted ? 'Marked as completed' : 'Not started yet'}
                        </Text>
                    )}

                    {/* Footer row — status dropdown + continue btn + timestamp */}
                    <View style={[S.footer, desktopRows && S.footerDesktop]}>
                        {/* Status dropdown trigger */}
                        <Pressable
                            style={[S.statusBtn, { borderColor: cfg.border, backgroundColor: cfg.dim }]}
                            onPress={(e) => { e.stopPropagation?.(); setStatusPickerFor(item.url); }}
                        >
                            <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                            <Text style={[S.statusBtnText, { color: cfg.color }]}>{status}</Text>
                            <Ionicons name="chevron-down" size={11} color={cfg.color} />
                        </Pressable>

                        {/* Continue button — only if has progress and not completed */}
                        {!isCompleted && lr && (
                            <Pressable
                                style={S.continueBtn}
                                onPress={(e) => { e.stopPropagation?.(); openContinue(item, lr); }}
                            >
                                <Ionicons name="play" size={11} color={C.accent} />
                                <Text style={S.continueBtnText}>{fmtCh(lr.chapterUrl, item)}</Text>
                            </Pressable>
                        )}

                        {lr?.timestamp && (
                            <Text style={S.ts}>{timeSince(lr.timestamp)}</Text>
                        )}
                    </View>
                </View>
                {desktopRows && <Pressable style={S.desktopRemove} onPress={(e) => { e.stopPropagation?.(); handleRemove(item.url); }} hitSlop={8} accessibilityLabel={`Remove ${item.title} from My List`}>
                    <Ionicons name="trash-outline" size={15} color={C.text2} />
                </Pressable>}
            </Pressable>
        );
    };

    // Count by status
    const counts = favorites.reduce((acc, f) => {
        const s = statusMap[f.url] || 'Reading';
        acc[s] = (acc[s] || 0) + 1; return acc;
    }, {});

    const filteredFavorites = favorites.filter(f => {
        const status = statusMap[f.url] || 'Reading';
        return (activeFilter === 'All' || status === activeFilter)
            && String(f.title || '').toLowerCase().includes(libraryQuery.trim().toLowerCase());
    }).sort((a, b) => {
        if (sortBy === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (sortBy === 'recent') {
            const aTime = lastReadInfo[a.url]?.timestamp || 0;
            const bTime = lastReadInfo[b.url]?.timestamp || 0;
            if (aTime !== bTime) return bTime - aTime;
        }
        const statusDiff = (STATUS_ORDER[statusMap[a.url] || 'Reading'] ?? 0) - (STATUS_ORDER[statusMap[b.url] || 'Reading'] ?? 0);
        return statusDiff || String(a.title || '').localeCompare(String(b.title || ''));
    });

    if (isGuest) {
        return (
            <SafeAreaView style={[S.screen, { justifyContent: 'center', alignItems: 'center', padding: 28 }]}>
                <Ionicons name="book-outline" size={44} color={C.text2} />
                <Text style={{ color: C.text1, fontSize: 24, fontWeight: '800', marginTop: 18 }}>Your list is empty</Text>
                <Text style={{ color: C.text2, fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 22 }}>
                    Sign in or create an account to save titles and sync your reading progress.
                </Text>
                <Pressable onPress={() => router.push('/login')} style={{ marginTop: 22, backgroundColor: C.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Sign In</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/signup')} style={{ marginTop: 18 }}>
                    <Text style={{ color: C.accentBright, fontWeight: '700' }}>Create Account</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/tabs/home')} style={{ marginTop: 26 }}>
                    <Text style={{ color: C.text2 }}>Continue browsing</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={S.screen}>
                <StatusBar barStyle="light-content" backgroundColor={C.bg0} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={S.screen}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg0} />

            {/* Header */}
            <View style={S.header}>
                {viewportWidth >= 900 && <View style={S.desktopNavigation}>
                    <Text style={S.brand}>Mangako</Text>
                    <View style={S.navigationLinks}>
                        <Pressable onPress={() => router.push('/tabs/home')} style={S.navItem}><Text style={S.navText}>Discover</Text></Pressable>
                        <Pressable onPress={() => router.push('/tabs/favorites')} style={S.navActive}><Text style={S.navActiveText}>My List</Text></Pressable>
                    </View>
                </View>}
                <View style={S.headerTop}>
                    <View style={S.headerHeading}>
                        <Text style={S.headerEyebrow}>YOUR LIBRARY</Text>
                        <Text style={S.headerTitle}>My List</Text>
                        <Text style={S.headerSub}>{favorites.length} saved titles · Pick up where you left off</Text>
                    </View>
                    {/* Stats pill group */}
                    {favorites.length > 0 && (
                        <View style={S.statsRow}>
                            {Object.entries(STATUS_CONFIG).map(([label, cfg]) => {
                                const n = counts[label] || 0;
                                if (!n) return null;
                                return (
                                    <View key={label} style={[S.statPill, { borderColor: cfg.border, backgroundColor: cfg.dim }]}>
                                        <Text style={[S.statNum, { color: cfg.color }]}>{n}</Text>
                                        <Text style={[S.statLabel, { color: cfg.color }]}>
                                            {label === 'Plan to Read' ? 'PTR' : label.split(' ')[0]}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </View>

            {favorites.length > 0 && (
                <View style={S.libraryToolbar}>
                    <View style={S.searchBox}>
                        <Ionicons name="search-outline" size={18} color={C.text2} />
                        <TextInput
                            style={S.librarySearch}
                            value={libraryQuery}
                            onChangeText={setLibraryQuery}
                            placeholder="Search your library"
                            placeholderTextColor={C.text2}
                            clearButtonMode="while-editing"
                            autoCapitalize="none"
                            accessibilityLabel="Search saved manga titles"
                        />
                        {!!libraryQuery && (
                            <Pressable onPress={() => setLibraryQuery('')} accessibilityLabel="Clear search">
                                <Ionicons name="close-circle" size={18} color={C.text2} />
                            </Pressable>
                        )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filters}>
                        {['All', ...STATUS_OPTIONS].map(status => {
                            const selected = activeFilter === status;
                            const n = status === 'All' ? favorites.length : (counts[status] || 0);
                            return (
                                <Pressable
                                    key={status}
                                    onPress={() => setActiveFilter(status)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    style={[S.filterChip, selected && S.filterChipActive]}
                                >
                                    <Text style={[S.filterText, selected && S.filterTextActive]}>{status}  {n}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    <View style={S.toolbarFooter}>
                        <Text style={S.filterSummary}>
                            {filteredFavorites.length} {filteredFavorites.length === 1 ? 'title' : 'titles'} shown
                        </Text>
                        <View style={S.sortRow}>
                            <Ionicons name="swap-vertical-outline" size={15} color={C.text2} />
                            <Text style={S.sortLabel}>Sort</Text>
                            {[
                                ['recent', 'Recent'],
                                ['status', 'Status'],
                                ['title', 'A–Z'],
                            ].map(([value, label]) => (
                                <Pressable key={value} onPress={() => setSortBy(value)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: sortBy === value }}
                                    style={[S.sortChip, sortBy === value && S.sortChipActive]}>
                                    <Text style={[S.sortChipText, sortBy === value && S.sortChipTextActive]}>{label}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>
            )}

            {favorites.length === 0 ? (
                <View style={S.empty}>
                    <View style={S.emptyIcon}>
                        <Ionicons name="bookmark-outline" size={32} color={C.text3} />
                    </View>
                    <Text style={S.emptyTitle}>Nothing saved yet</Text>
                    <Text style={S.emptySub}>Manga you add to your list will appear here</Text>
                </View>
            ) : (
                <FlatList
                    key={twoColumns ? 'library-two-columns' : 'library-one-column'}
                    data={filteredFavorites}
                    numColumns={twoColumns ? 2 : 1}
                    columnWrapperStyle={twoColumns ? S.columnRow : undefined}
                    keyExtractor={item => item.url}
                    renderItem={renderItem}
                    initialNumToRender={10}
                    maxToRenderPerBatch={8}
                    updateCellsBatchingPeriod={50}
                    windowSize={7}
                    contentContainerStyle={[S.list, { width: '100%', maxWidth: 1340, alignSelf: 'center', paddingHorizontal: viewportWidth >= 700 ? 24 : 14 }]}
                    ListEmptyComponent={<View style={S.emptyFiltered}><Ionicons name="search-outline" size={25} color={C.text2} /><Text style={S.emptyTitle}>No matching titles</Text><Text style={S.emptySub}>Try another search or reading status.</Text></View>}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
                />
            )}

            {/* ── Status Picker Modal ──────────────────────────────────── */}
            <Modal
                visible={!!statusPickerFor}
                transparent
                animationType="fade"
                onRequestClose={() => setStatusPickerFor(null)}
            >
                <Pressable style={S.modalMask} onPress={() => setStatusPickerFor(null)}>
                    <View style={S.modalSheet}>
                        <Text style={S.modalTitle}>Set Reading Status</Text>
                        {STATUS_OPTIONS.map((opt) => {
                            const cfg = STATUS_CONFIG[opt];
                            const current = statusPickerFor && statusMap[statusPickerFor] === opt;
                            return (
                                <Pressable
                                    key={opt}
                                    style={({ pressed }) => [
                                        S.modalOpt,
                                        current && { backgroundColor: cfg.dim },
                                        { opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    onPress={() => handleStatusChange(statusPickerFor, opt)}
                                >
                                    <View style={[S.modalOptIcon, { backgroundColor: cfg.dim, borderColor: cfg.border }]}>
                                        <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                                    </View>
                                    <Text style={[S.modalOptText, { color: current ? cfg.color : C.text1 }]}>{opt}</Text>
                                    {current && <Ionicons name="checkmark" size={16} color={cfg.color} style={{ marginLeft: 'auto' }} />}
                                </Pressable>
                            );
                        })}
                    </View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg1 },

    desktopNavigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 16 },
    brand: { color: C.text1, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
    navigationLinks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    navItem: { paddingVertical: 9, paddingHorizontal: 16 },
    navText: { color: C.text2, fontWeight: '700', fontSize: 13 },
    navActive: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.accentDim },
    navActiveText: { color: C.accentBright, fontWeight: '800', fontSize: 13 },
    header: {
        backgroundColor: C.bg1,
        borderBottomWidth: 1, borderBottomColor: C.border,
        paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14,
    },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 1292, width: '100%', alignSelf: 'center' },
    headerHeading: { flexShrink: 1, minWidth: 160 },
    headerEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: C.accentBright, marginBottom: 6 },
    headerTitle: { fontSize: 29, fontWeight: '800', color: C.text1, letterSpacing: -1 },
    headerSub: { fontSize: 12, color: C.text2, marginTop: 4, fontWeight: '500' },

    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 400, flexShrink: 1 },
    statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
    statNum: { fontSize: 13, fontWeight: '800' },
    statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },

    list: { paddingTop: 10, paddingBottom: 42, gap: 12 },
    columnRow: { gap: 12 },
    libraryToolbar: { width: '100%', maxWidth: 1340, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 8, gap: 12 },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg3, borderColor: C.borderMid, borderWidth: 1, paddingHorizontal: 14, borderRadius: 12, minHeight: 48 },
    librarySearch: { flex: 1, color: C.text1, fontSize: 14, paddingVertical: 11, minWidth: 0 },
    filters: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2, paddingRight: 18 },
    filterChip: { borderRadius: 7, borderWidth: 1, borderColor: C.borderMid, backgroundColor: C.bg2, paddingHorizontal: 13, paddingVertical: 9 },
    filterChipActive: { backgroundColor: C.bg4, borderColor: C.accentBorder },
    filterText: { fontSize: 12, color: C.text2, fontWeight: '700' },
    filterTextActive: { color: C.accentBright },
    filterSummary: { fontSize: 12, color: C.text2, fontWeight: '600' },
    toolbarFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    sortRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
    sortLabel: { fontSize: 11, color: C.text2, marginRight: 5 },
    sortChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg2 },
    sortChipActive: { backgroundColor: C.accentDim, borderColor: C.accentBorder },
    sortChipText: { color: C.text2, fontSize: 11, fontWeight: '700' },
    sortChipTextActive: { color: C.accentBright },
    emptyFiltered: { alignItems: 'center', paddingTop: 90, gap: 10 },

    // Card
    card: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: C.bg2,
        borderRadius: 11,
        borderWidth: 1, borderColor: C.borderMid,
        minHeight: 128,
        overflow: 'hidden',
    },
    cardCompleted: { borderColor: C.border },
    cardDesktop: { minHeight: 132 },
    coverWrapDesktop: { width: 90, height: 132 },
    coverDesktop: { width: 90, height: 132 },
    contentDesktop: { minHeight: 132, paddingVertical: 12 },
    footerDesktop: { gap: 7 },
    desktopRemove: { width: 34, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    cardBar: { width: 3 },

    coverWrap: { width: 84, position: 'relative', backgroundColor: C.bg4 },
    cover: { width: '100%', height: '100%', minHeight: 128 },
    coverCompleted: { opacity: 0.8 },
    coverEmpty: { backgroundColor: C.bg4, alignItems: 'center', justifyContent: 'center', minHeight: 128 },
    srcBadge: { position: 'absolute', top: 5, right: 5, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3 },
    srcText: { color: '#fff', fontSize: 7.5, fontWeight: '800' },
    completedOverlay: {
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(7,7,10,0.45)',
        alignItems: 'center', justifyContent: 'center',
    },

    content: { flex: 1, padding: 12, minWidth: 0, justifyContent: 'space-between', gap: 6 },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text1, lineHeight: 19, marginRight: 6 },
    delBtn: { padding: 2, marginTop: 1 },

    // Chapter progress
    progressWrap: { marginBottom: 1 },
    notStartedText: { fontSize: 11, color: C.text3 },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    progressText: { fontSize: 11, color: C.text2, fontWeight: '600' },
    progressPct: { fontSize: 10, color: C.text3, fontWeight: '600' },
    progressBar: { height: 3, backgroundColor: C.bg4, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2 },

    // Footer
    footer: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 'auto' },
    statusBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7,
        minHeight: 32,
    },
    statusBtnText: { fontSize: 12, fontWeight: '700' },
    continueBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentBorder,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7,
        minHeight: 32,
    },
    continueBtnText: { color: C.accentBright, fontSize: 12, fontWeight: '700' },
    ts: { fontSize: 11, color: C.text3, marginLeft: 'auto' },

    // Empty
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 48 },
    emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text2 },
    emptySub: { fontSize: 13, color: C.text3, textAlign: 'center', lineHeight: 20 },

    // Modal
    modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: {
        backgroundColor: C.bg3,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderWidth: 1, borderColor: C.borderMid,
        paddingTop: 8, paddingBottom: 36,
    },
    modalTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.text3, textAlign: 'center', paddingVertical: 14, textTransform: 'uppercase' },
    modalOpt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, gap: 14 },
    modalOptIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    modalOptText: { fontSize: 15, fontWeight: '600' },
});