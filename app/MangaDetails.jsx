import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    View, Text, Image, StyleSheet, ActivityIndicator,
    ScrollView, Pressable, SafeAreaView, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { proxied as proxiedAsura } from '../manga_api/asurascans';
import { getMangapillManga, proxied as proxiedMangapill } from '../manga_api/mangapill';
import { proxied as proxiedMgeko } from '../manga_api/mgeko';
import { getManhwaById } from '../manga_api/hardcodedManhwas';
import { Ionicons } from '@expo/vector-icons';
import { addFavorite, removeFavorite, getFavorites, getLastReadChapter, saveLastReadChapter } from "./searchStorage";
import { getCoverUrl as getStaticCover } from "../api/coverurls";

const C = {
    bg0:'#07070a', bg1:'#0c0c10', bg2:'#111118', bg3:'#18181f', bg4:'#1f1f28',
    border:'rgba(255,255,255,0.06)', borderMid:'rgba(255,255,255,0.10)',
    text1:'#eeedf0', text2:'#7c7b88', text3:'#38373f',
    accent:'#7c6af5', accentBright:'#9d8fff',
    accentDim:'rgba(124,106,245,0.14)', accentBorder:'rgba(124,106,245,0.28)',
    green:'#34d399', greenDim:'rgba(52,211,153,0.10)', greenBorder:'rgba(52,211,153,0.25)',
    star:'#fbbf24', danger:'#f87171',
};

const PAGE_SIZE = 50;
const BACKEND = process.env.EXPO_PUBLIC_CHAPTERS_API;
const STATUS_OPTIONS = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Unfollow'];

function extractNum(ch) {
    const s = ch?.id ?? ch?.title ?? ch?.url ?? '';
    const m = String(s).match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : NaN;
}
function displayTitle(ch) { return ch?.title || ch?.name || 'Chapter'; }

const normalizeKey = (key) => {
    if (!key) return '';
    if (key.includes('mangapill.com')) {
        const parts = key.split('/').filter(Boolean);
        const index = parts.indexOf('manga');
        if (index !== -1 && parts[index + 1]) {
            return parts.slice(index + 1).join('__');
        } else {
            return parts.pop() || key;
        }
    }
    return key;
};

const MangaDetails = () => {
    const { seriesId, mangapillUrl, source } = useLocalSearchParams();
    const router = useRouter();
    const scrollRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [ascending, setAscending] = useState(false);
    const [page, setPage] = useState(1);
    const [isFav, setIsFav] = useState(false);
    const [mangaData, setMangaData] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [lastRead, setLastRead] = useState(null);
    const [statusOpen, setStatusOpen] = useState(false);
    const [status, setStatus] = useState(null);

    // FIX: Catch MangaPill items passing back in via stored flat favorites key format
    const isMgeko = source === 'mgeko' || String(seriesId).startsWith('mgeko__');
    const isAsura = source === 'asura' && !isMgeko;
    const isMangapill = !isMgeko && (source === 'mangapill' || !!mangapillUrl || String(seriesId).includes('__'));

    const storageKey = useMemo(() => normalizeKey(seriesId || mangapillUrl), [seriesId, mangapillUrl]);

    // Derived full path helper for MangaPill deep targets
    const resolvedMangapillUrl = useMemo(() => {
        const raw = mangapillUrl || seriesId;
        if (!raw) return null;
        if (raw.includes('mangapill.com')) return raw;
        if (isMangapill && raw.includes('__')) {
            return `https://mangapill.com/manga/${raw.replace('__', '/')}`;
        }
        return raw;
    }, [mangapillUrl, seriesId, isMangapill]);

    useEffect(() => {
        (async () => {
            if (!storageKey) return;
            setLastRead(await getLastReadChapter(storageKey).catch(() => null));
        })();
    }, [storageKey]);

    useEffect(() => {
        (async () => {
            if (!storageKey) return;
            const favs = await getFavorites().catch(() => []);
            setIsFav(favs.some(f => f.url === storageKey));
            const s = await AsyncStorage.getItem(`status:${storageKey}`).catch(() => null);
            setStatus(s || null);
        })();
    }, [storageKey]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                if (isMangapill && resolvedMangapillUrl) {
                    const data = await getMangapillManga(resolvedMangapillUrl);
                    if (!cancelled) {
                        setMangaData(data);
                        setChapters(data.chapters || []);
                        if (data.chapters?.length) {
                            await AsyncStorage.setItem(`chapterCount:${storageKey}`, String(data.chapters.length)).catch(() => {});
                            await AsyncStorage.setItem(`updatedAt:${storageKey}`, String(Date.now())).catch(() => {});

                            const newest = [...data.chapters].sort((a, b) => extractNum(b) - extractNum(a))[0];
                            if (newest?.id) {
                                await AsyncStorage.setItem(`latestChapter:${storageKey}`, newest.id).catch(() => {});
                            }
                        }
                    }
                } else if ((isAsura || isMgeko) && seriesId) {
                    const localData = getManhwaById(seriesId);
                    if (!cancelled && localData) {
                        setMangaData(localData);
                    }

                    const endpoint = isMgeko ? 'mgeko-chapters' : 'asura-chapters';
                    const res = await fetch(`${BACKEND}/api/${endpoint}?seriesId=${encodeURIComponent(seriesId)}`);
                    const json = await res.json();
                    if (!cancelled && json.chapters) {
                        setChapters(json.chapters);
                        if (json.total) {
                            await AsyncStorage.setItem(`chapterCount:${storageKey}`, String(json.total)).catch(() => {});
                            await AsyncStorage.setItem(`updatedAt:${storageKey}`, String(Date.now())).catch(() => {});

                            const newest = [...json.chapters].sort((a, b) => extractNum(b) - extractNum(a))[0];
                            if (newest?.id) {
                                await AsyncStorage.setItem(`latestChapter:${storageKey}`, newest.id).catch(() => {});
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('MangaDetails fetch error:', e);
                if (!cancelled) { setMangaData(null); setChapters([]); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [seriesId, resolvedMangapillUrl, source, isMangapill]);

    const getCoverUrl = () => {
        const staticUrl = getStaticCover(storageKey);
        const dataUrl = mangaData?.image || mangaData?.cover || null;
        const url = staticUrl || dataUrl;
        if (!url) return null;
        if (isAsura) return proxiedAsura(url);
        if (isMgeko) return proxiedMgeko(url);
        return proxiedMangapill(url);
    };

    const getFavData = () => {
        const freshCover = getCoverUrl();
        return {
            url: storageKey,
            title: mangaData?.title || 'Manga',
            description: mangaData?.description || '',
            coverUrl: freshCover,
            cover: freshCover,
            source: isMangapill ? 'mangapill' : isMgeko ? 'mgeko' : 'asura',
        };
    };

    const handleStatus = async (opt) => {
        setStatusOpen(false);
        if (opt === 'Unfollow') {
            await removeFavorite(storageKey);
            await AsyncStorage.removeItem(`status:${storageKey}`);
            setIsFav(false); setStatus(null);
        } else {
            setStatus(opt);
            await AsyncStorage.setItem(`status:${storageKey}`, opt);
            if (!isFav) { await addFavorite(getFavData()); setIsFav(true); }
        }
    };

    const toggleFav = async () => {
        if (isFav) {
            await removeFavorite(storageKey);
            await AsyncStorage.removeItem(`status:${storageKey}`);
            setIsFav(false); setStatus(null);
        } else {
            await addFavorite(getFavData());
            setIsFav(true);
            await AsyncStorage.setItem(`status:${storageKey}`, 'Reading');
            setStatus('Reading');
        }
    };

    const handleChapter = async (ch) => {
        const cId = ch.id;
        if (storageKey) { await saveLastReadChapter(storageKey, cId); setLastRead(cId); }

        if (isMangapill) {
            router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(ch.url)}&mangapillUrl=${encodeURIComponent(resolvedMangapillUrl)}&source=mangapill`);
        } else if (isAsura) {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(cId)}&source=asura`);
        } else if (isMgeko) {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(cId)}&source=mgeko`);
        }
    };

    const sorted = useMemo(() => [...chapters].sort((a, b) => {
        const na = extractNum(a), nb = extractNum(b);
        if (isNaN(na) && isNaN(nb)) return 0;
        if (isNaN(na)) return 1; if (isNaN(nb)) return -1;
        return ascending ? na - nb : nb - na;
    }), [chapters, ascending]);

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const paged = sorted.slice(start, Math.min(start + PAGE_SIZE, total));
    const navPage = (d) => {
        const n = page + d;
        if (n < 1 || n > totalPages) return;
        setPage(n);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
    };

    if (loading) return (
        <SafeAreaView style={S.safe}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg0} />
            <View style={S.loadWrap}><ActivityIndicator size="large" color={C.accent} /></View>
        </SafeAreaView>
    );

    const title = mangaData?.title || 'Unknown';
    const cover = getCoverUrl();
    const isOngoing = mangaData?.status === 'Ongoing';
    const srcLabel = isMangapill ? 'MangaPill' : isMgeko ? 'MgEko' : 'AsuraScans';
    const srcColor = isMangapill ? '#38bdf8' : isMgeko ? '#10b981' : C.accent;

    return (
        <SafeAreaView style={S.safe}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg0} />

            <View style={S.topBar}>
                <Pressable onPress={() => router.replace('/tabs/home')} hitSlop={10}>
                    <Image source={dragonLogo} style={S.logoImg} />
                </Pressable>
                <Text style={S.topTitle} numberOfLines={1}>{title}</Text>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

                {/* HERO */}
                <View style={S.hero}>
                    <View style={S.coverShadow}>
                        {cover
                            ? <Image source={{ uri: cover }} style={S.cover} resizeMode="cover" />
                            : <View style={[S.cover, { backgroundColor: C.bg3, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="book-outline" size={38} color={C.text3} /></View>
                        }
                    </View>
                    <View style={S.heroMeta}>
                        <Text style={S.heroTitle} numberOfLines={4}>{title}</Text>
                        <View style={S.srcRow}>
                            <View style={[S.srcDot, { backgroundColor: srcColor }]} />
                            <Text style={S.srcText}>{srcLabel}</Text>
                        </View>
                        {mangaData?.status && (
                            <View style={[S.statusPill,
                                isOngoing
                                    ? { borderColor: C.greenBorder, backgroundColor: C.greenDim }
                                    : { borderColor: C.border, backgroundColor: 'transparent' }
                            ]}>
                                <View style={[S.statusDot, { backgroundColor: isOngoing ? C.green : C.text3 }]} />
                                <Text style={[S.statusText, { color: isOngoing ? C.green : C.text2 }]}>{mangaData.status}</Text>
                            </View>
                        )}
                        {mangaData?.genres?.length > 0 && (
                            <View style={S.genreRow}>
                                {mangaData.genres.slice(0, 3).map((g, i) => (
                                    <View key={i} style={S.genreTag}><Text style={S.genreText}>{g}</Text></View>
                                ))}
                                {mangaData.genres.length > 3 && <Text style={S.genreMore}>+{mangaData.genres.length - 3}</Text>}
                            </View>
                        )}
                    </View>
                </View>

                {/* ACTION ROW */}
                <View style={S.actions}>
                    <Pressable
                        style={({ pressed }) => [S.readBtn, { opacity: pressed ? 0.85 : 1 }]}
                        onPress={() => {
                            if (lastRead) {
                                if (isMangapill) router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(lastRead)}&mangapillUrl=${encodeURIComponent(resolvedMangapillUrl)}&source=mangapill`);
                                else if (isAsura) router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(lastRead)}&source=asura`);
                                else if (isMgeko) router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(lastRead)}&source=mgeko`);
                            } else if (sorted.length > 0) handleChapter(sorted[sorted.length - 1]);
                        }}
                    >
                        <Ionicons name={lastRead ? 'play' : 'play-skip-forward'} size={14} color="#fff" style={{ marginRight: 7 }} />
                        <Text style={S.readBtnText}>{lastRead ? 'Continue Reading' : 'Start Reading'}</Text>
                    </Pressable>

                    <View style={S.statusWrap}>
                        <Pressable
                            style={({ pressed }) => [S.listBtn, isFav && S.listBtnActive, { opacity: pressed ? 0.85 : 1 }]}
                            onPress={() => setStatusOpen(v => !v)}
                        >
                            <Ionicons name={isFav ? 'bookmark' : 'bookmark-outline'} size={13} color={isFav ? C.green : C.text2} style={{ marginRight: 5 }} />
                            <Text style={[S.listBtnText, isFav && { color: C.green }]}>
                                {status || (isFav ? 'Reading' : 'Add to List')}
                            </Text>
                            <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={11} color={isFav ? C.green : C.text3} style={{ marginLeft: 3 }} />
                        </Pressable>
                        {statusOpen && (
                            <>
                                <Pressable style={S.statusMask} onPress={() => setStatusOpen(false)} />
                                <View style={S.statusMenu}>
                                    {STATUS_OPTIONS.map((opt, i) => {
                                        const isUnfollow = opt === 'Unfollow', isActive = status === opt;
                                        return (
                                            <Pressable
                                                key={opt}
                                                style={({ pressed }) => [S.statusOpt, i < STATUS_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }, { opacity: pressed ? 0.7 : 1 }]}
                                                onPress={() => handleStatus(opt)}
                                            >
                                                <Ionicons
                                                    name={isUnfollow ? 'trash-outline' : isActive ? 'checkmark-circle' : 'ellipse-outline'}
                                                    size={14} color={isUnfollow ? C.danger : isActive ? C.green : C.text3}
                                                    style={{ marginRight: 8 }}
                                                />
                                                <Text style={[S.statusOptText, isActive && { color: C.green, fontWeight: '700' }, isUnfollow && { color: C.danger }]}>{opt}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}
                    </View>

                    <Pressable style={({ pressed }) => [S.starBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={toggleFav} hitSlop={10}>
                        <Ionicons name={isFav ? 'star' : 'star-outline'} size={21} color={isFav ? C.star : C.text3} />
                    </Pressable>
                </View>

                {/* SYNOPSIS */}
                <View style={S.block}>
                    <Text style={S.blockLabel}>SYNOPSIS</Text>
                    <Text style={S.synopsis}>{mangaData?.description || 'No description available.'}</Text>
                </View>

                {/* TAGS */}
                {mangaData?.genres?.length > 0 && (
                    <View style={[S.tagsBlock, { borderTopColor: C.border }]}>
                        {mangaData.genres.map((g, i) => (
                            <View key={i} style={S.tagFull}><Text style={S.tagFullText}>{g}</Text></View>
                        ))}
                    </View>
                )}

                {/* CHAPTERS */}
                <View style={[S.chSection, { borderTopColor: C.border }]}>
                    <View style={S.chHead}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={S.blockLabel}>CHAPTERS</Text>
                            <View style={S.chCountBadge}><Text style={S.chCountText}>{total}</Text></View>
                        </View>
                        <Pressable style={({ pressed }) => [S.sortBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => setAscending(v => !v)}>
                            <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={11} color={C.text2} style={{ marginRight: 4 }} />
                            <Text style={S.sortText}>{ascending ? 'Oldest' : 'Newest'}</Text>
                        </Pressable>
                    </View>

                    {totalPages > 1 && (
                        <View style={S.pager}>
                            <Pressable disabled={page <= 1} onPress={() => navPage(-1)} style={({ pressed }) => [S.pageBtn, { opacity: (pressed || page <= 1) ? 0.38 : 1 }]}>
                                <Ionicons name="chevron-back" size={12} color={C.text1} /><Text style={S.pageBtnText}>Prev</Text>
                            </Pressable>
                            <Text style={S.pageInfo}>{start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}</Text>
                            <Pressable disabled={page >= totalPages} onPress={() => navPage(1)} style={({ pressed }) => [S.pageBtn, { opacity: (pressed || page >= totalPages) ? 0.38 : 1 }]}>
                                <Text style={S.pageBtnText}>Next</Text><Ionicons name="chevron-forward" size={12} color={C.text1} />
                            </Pressable>
                        </View>
                    )}

                    {!isMangapill && !chapters.length && !loading && (
                        <View style={S.warnBox}>
                            <Ionicons name="alert-circle-outline" size={14} color={C.star} />
                            <Text style={S.warnText}>No chapters found for this series.</Text>
                        </View>
                    )}

                    {paged.map((ch, i) => {
                        const cId = ch.id;
                        const isLast = lastRead === cId;
                        return (
                            <Pressable
                                key={`${cId}-${i}`}
                                onPress={() => handleChapter(ch)}
                                style={({ pressed }) => [
                                    S.chRow,
                                    { backgroundColor: isLast ? 'rgba(52,211,153,0.07)' : i % 2 === 0 ? C.bg1 : C.bg2 },
                                    { opacity: pressed ? 0.72 : 1 },
                                ]}
                            >
                                <View style={[S.chBar, { backgroundColor: isLast ? C.green : 'transparent' }]} />
                                <Text style={[S.chTitle, isLast && { color: C.green, fontWeight: '700' }]}>
                                    {displayTitle(ch)}
                                </Text>
                                {isLast && (
                                    <View style={S.lastBadge}>
                                        <Ionicons name="bookmark" size={9} color={C.green} />
                                        <Text style={S.lastText}>Last read</Text>
                                    </View>
                                )}
                                <Ionicons name="chevron-forward" size={13} color={C.text3} style={{ marginLeft: 'auto' }} />
                            </Pressable>
                        );
                    })}

                    {!paged.length && !loading && <Text style={S.noCh}>No chapters found.</Text>}

                    {totalPages > 1 && (
                        <View style={[S.pager, { marginTop: 8, marginBottom: 24, borderTopWidth: 1, borderTopColor: C.border }]}>
                            <Pressable disabled={page <= 1} onPress={() => navPage(-1)} style={({ pressed }) => [S.pageBtn, { opacity: (pressed || page <= 1) ? 0.38 : 1 }]}>
                                <Ionicons name="chevron-back" size={12} color={C.text1} /><Text style={S.pageBtnText}>Prev</Text>
                            </Pressable>
                            <Text style={S.pageInfo}>Page {page}/{totalPages}</Text>
                            <Pressable disabled={page >= totalPages} onPress={() => navPage(1)} style={({ pressed }) => [S.pageBtn, { opacity: (pressed || page >= totalPages) ? 0.38 : 1 }]}>
                                <Text style={S.pageBtnText}>Next</Text><Ionicons name="chevron-forward" size={12} color={C.text1} />
                            </Pressable>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default MangaDetails;

const S = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg1 },
    loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bg1, borderBottomWidth: 1, borderBottomColor: C.border },
    logoImg: { width: 30, height: 30, resizeMode: 'contain' },
    topTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text2, letterSpacing: -0.2 },
    hero: { flexDirection: 'row', padding: 18, gap: 16 },
    coverShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.65, shadowRadius: 20, elevation: 14 },
    cover: { width: 116, height: 170, borderRadius: 10 },
    heroMeta: { flex: 1, gap: 9 },
    heroTitle: { fontSize: 19, fontWeight: '800', color: C.text1, lineHeight: 25, letterSpacing: -0.5 },
    srcRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.bg3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    srcDot: { width: 6, height: 6, borderRadius: 3 },
    srcText: { fontSize: 10, fontWeight: '700', color: C.text2, letterSpacing: 0.2 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '600' },
    genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    genreTag: { backgroundColor: C.bg4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
    genreText: { fontSize: 10, fontWeight: '600', color: C.text3 },
    genreMore: { fontSize: 10, color: C.text3, paddingVertical: 3 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg2 },
    readBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, paddingVertical: 11, borderRadius: 10, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.38, shadowRadius: 10, elevation: 6 },
    readBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    statusWrap: { position: 'relative' },
    statusBtn: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#4CAF50', paddingHorizontal: 12,
        paddingVertical: 10, borderRadius: 8,
    },
    statusBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    statusDropdown: {
        position: 'absolute', bottom: 46, right: 0,
        backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
        borderRadius: 8, zIndex: 999, minWidth: 150,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 }, elevation: 10,
    },
    statusOption: { paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
    statusOptionUnfollow: { borderBottomWidth: 0 },
    statusOptionText: { fontSize: 14, color: '#333' },
    statusOptionActive: { color: '#4CAF50', fontWeight: '700' },
    statusOptionUnfollowText: { color: '#e53935' },

    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', paddingHorizontal: 16, marginTop: 20, marginBottom: 6 },
    description: { fontSize: 14, lineHeight: 22, color: '#444', paddingHorizontal: 16, marginBottom: 8 },
    tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
    tag: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    tagText: { fontSize: 12, color: '#444' },

    chapterHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, marginTop: 8, marginBottom: 6,
    },
    toggleOrder: { color: '#007AFF', fontSize: 13 },
    rangeText: { color: '#888', fontSize: 12 },
    chapterRow: {
        paddingVertical: 13, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    chapterRowLastRead: { backgroundColor: '#f0faf0', borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
    chapterTitle: { fontSize: 15, color: '#111', fontWeight: '500' },
    chapterTitleLastRead: { color: '#2E7D32', fontWeight: '600' },
    lastReadBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    lastReadText: { fontSize: 11, color: '#4CAF50', fontWeight: '600', marginLeft: 3 },
    pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginVertical: 8, paddingHorizontal: 16 },
    pagerBtn: { flex: 1, backgroundColor: '#f5f5f5', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#111', fontWeight: '600', fontSize: 13 },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#666', fontSize: 13 },
    noChaptersBox: { margin: 16, padding: 12, backgroundColor: '#fff3cd', borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
    noChaptersText: { flex: 1, fontSize: 13, color: '#856404' },
    listBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg4, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 10 },
    listBtnActive: { borderColor: C.greenBorder, backgroundColor: C.greenDim },
    listBtnText: { fontSize: 12, fontWeight: '600', color: C.text2 },
    statusMask: { position: 'absolute', top: 0, left: -300, right: -300, bottom: -400, zIndex: 98 },
    statusMenu: { position: 'absolute', bottom: 48, right: 0, zIndex: 999, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.borderMid, borderRadius: 12, minWidth: 168, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 14 },
    statusOpt: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
    statusOptText: { fontSize: 14, color: C.text1 },
    starBtn: { padding: 6 },
    block: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14 },
    blockLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: C.text3, marginBottom: 10 },
    synopsis: { fontSize: 13.5, lineHeight: 22, color: C.text2 },
    tagsBlock: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, borderTopWidth: 1 },
    tagFull: { backgroundColor: C.bg3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: C.border },
    tagFullText: { fontSize: 11, color: C.text2 },
    chSection: { borderTopWidth: 1 },
    chHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
    chCountBadge: { backgroundColor: C.bg4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    chCountText: { fontSize: 11, fontWeight: '700', color: C.text2 },
    sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border },
    sortText: { fontSize: 11, fontWeight: '600', color: C.text2 },
    pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
    pageBtnText: { fontSize: 12, fontWeight: '600', color: C.text1 },
    pageInfo: { fontSize: 12, color: C.text2 },
    chRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 16 },
    chBar: { width: 3, alignSelf: 'stretch', minHeight: 42, marginRight: 13, borderRadius: 1.5 },
    chTitle: { fontSize: 13.5, fontWeight: '500', color: C.text1, flex: 1 },
    lastBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 8 },
    lastText: { fontSize: 10, fontWeight: '700', color: C.green },
    warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, padding: 12, borderRadius: 10, backgroundColor: 'rgba(251,191,36,0.07)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.18)' },
    warnText: { flex: 1, fontSize: 12, color: C.star },
    noCh: { padding: 20, textAlign: 'center', fontSize: 14, color: C.text3 },
});