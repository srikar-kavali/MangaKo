import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { proxied as proxiedAsura } from '../manga_api/asurascans';
import { getMangapillManga, proxied as proxiedMangapill } from '../manga_api/mangapill';
import { getManhwaById } from '../manga_api/hardcodedManhwas';
import { Ionicons } from '@expo/vector-icons';
import { addFavorite, removeFavorite, getFavorites, getLastReadChapter, saveLastReadChapter } from "./searchStorage";

const PAGE_SIZE = 50;
const BACKEND = process.env.EXPO_PUBLIC_CHAPTERS_API;

const STATUS_OPTIONS = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Unfollow'];

function extractChapterNumber(ch) {
    const s = ch?.id ?? ch?.title ?? ch?.url ?? '';
    const m = String(s).match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : NaN;
}

function displayChapterTitle(ch) {
    return ch?.title || ch?.name || 'Chapter';
}

const MangaDetails = () => {
    const { seriesId, mangapillUrl, source } = useLocalSearchParams();
    const router = useRouter();
    const scrollRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [ascending, setAscending] = useState(false);
    const [page, setPage] = useState(1);
    const [isFavorite, setIsFavorite] = useState(false);
    const [mangaData, setMangaData] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [lastReadChapter, setLastReadChapter] = useState(null);
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [readingStatus, setReadingStatus] = useState(null);

    const isAsura = source === 'asura' || !!seriesId;
    const isMangapill = source === 'mangapill' || !!mangapillUrl;
    const storageKey = useMemo(() => seriesId || mangapillUrl, [seriesId, mangapillUrl]);

    useEffect(() => {
        (async () => {
            if (!storageKey) return;
            const saved = await getLastReadChapter(storageKey).catch(() => null);
            setLastReadChapter(saved);
        })();
    }, [storageKey]);

    useEffect(() => {
        (async () => {
            if (!storageKey) return;
            const favs = await getFavorites().catch(() => []);
            setIsFavorite(favs.some(f => f.url === storageKey));
            const stored = await AsyncStorage.getItem(`status:${storageKey}`).catch(() => null);
            setReadingStatus(stored || null);
        })();
    }, [storageKey]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                if (isAsura && seriesId) {
                    const hardcoded = getManhwaById(seriesId);
                    if (hardcoded && !cancelled) {
                        setMangaData({
                            title: hardcoded.title,
                            description: hardcoded.description || 'No description available.',
                            image: hardcoded.cover,
                            genres: hardcoded.genres || [],
                            status: hardcoded.status || 'Unknown',
                        });
                    }
                    const res = await fetch(`${BACKEND}/api/asura-chapters?seriesId=${encodeURIComponent(seriesId)}`);
                    const json = await res.json();
                    if (!cancelled && json.chapters) setChapters(json.chapters);
                } else if (isMangapill && mangapillUrl) {
                    const data = await getMangapillManga(mangapillUrl);
                    if (!cancelled) {
                        setMangaData(data);
                        setChapters(data.chapters || []);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch manga details:', err);
                if (!cancelled) { setMangaData(null); setChapters([]); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [seriesId, mangapillUrl, source]);

    const getCoverUrl = () => {
        if (!mangaData) return null;
        if (isAsura) return mangaData.image ? proxiedAsura(mangaData.image) : null;
        return mangaData.cover ? proxiedMangapill(mangaData.cover) : null;
    };

    const getFavData = () => ({
        url: storageKey,
        title: mangaData?.title || "Manga",
        description: mangaData?.description || "No description available.",
        coverUrl: getCoverUrl(),
        cover: getCoverUrl(),
        source: isAsura ? 'asura' : 'mangapill',
    });

    const handleStatusSelect = async (opt) => {
        setStatusMenuOpen(false);
        if (opt === 'Unfollow') {
            await removeFavorite(storageKey);
            await AsyncStorage.removeItem(`status:${storageKey}`);
            setIsFavorite(false);
            setReadingStatus(null);
        } else {
            setReadingStatus(opt);
            await AsyncStorage.setItem(`status:${storageKey}`, opt);
            if (!isFavorite) {
                await addFavorite(getFavData());
                setIsFavorite(true);
            }
        }
    };

    const toggleFavorite = async () => {
        if (isFavorite) {
            await removeFavorite(storageKey);
            await AsyncStorage.removeItem(`status:${storageKey}`);
            setIsFavorite(false);
            setReadingStatus(null);
        } else {
            await addFavorite(getFavData());
            setIsFavorite(true);
            await AsyncStorage.setItem(`status:${storageKey}`, 'Reading');
            setReadingStatus('Reading');
        }
    };

    const handleChapterPress = async (chapter) => {
        const chapterId = isAsura ? chapter.id : chapter.url;
        if (storageKey) {
            await saveLastReadChapter(storageKey, chapterId);
            setLastReadChapter(chapterId);
        }
        if (isAsura) {
            router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(chapter.id)}&source=asura`);
        } else {
            router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(chapter.url)}&mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill`);
        }
    };

    const sortedChapters = useMemo(() => {
        return [...chapters].sort((a, b) => {
            const na = extractChapterNumber(a), nb = extractChapterNumber(b);
            if (isNaN(na) && isNaN(nb)) return 0;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            return ascending ? na - nb : nb - na;
        });
    }, [chapters, ascending]);

    const total = sortedChapters.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startIdx = (page - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, total);
    const pagedChapters = sortedChapters.slice(startIdx, endIdx);

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
    }

    const title = mangaData?.title || 'No title';
    const description = mangaData?.description || 'No description';
    const coverUrl = getCoverUrl();
    const sourceLabel = isAsura ? 'AsuraScans' : 'MangaPill';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.topBar}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>

                {/* Hero section — ComicK style */}
                <View style={styles.hero}>
                    {coverUrl && (
                        <Image source={{ uri: coverUrl }} style={styles.cover} />
                    )}
                    <View style={styles.heroMeta}>
                        <Text style={styles.title} numberOfLines={3}>{title}</Text>
                        <Text style={styles.sourceLabel}>from {sourceLabel}</Text>

                        {mangaData?.status ? (
                            <View style={styles.statusBadge}>
                                <View style={[styles.statusDot, { backgroundColor: mangaData.status === 'Ongoing' ? '#4CAF50' : '#999' }]} />
                                <Text style={styles.statusBadgeText}>{mangaData.status}</Text>
                            </View>
                        ) : null}

                        {mangaData?.genres?.length > 0 && (
                            <View style={styles.genreWrap}>
                                {mangaData.genres.slice(0, 3).map((g, i) => (
                                    <View key={i} style={styles.genreTag}>
                                        <Text style={styles.genreTagText}>{g}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>

                {/* Action buttons row — ComicK style */}
                <View style={styles.actionRow}>
                    {/* Continue Reading */}
                    <Pressable
                        style={styles.continueBtn}
                        onPress={() => {
                            if (lastReadChapter) {
                                if (isAsura) {
                                    router.push(`/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(lastReadChapter)}&source=asura`);
                                } else {
                                    router.push(`/ReadChapter?chapterUrl=${encodeURIComponent(lastReadChapter)}&mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill`);
                                }
                            } else if (sortedChapters.length > 0) {
                                handleChapterPress(sortedChapters[sortedChapters.length - 1]);
                            }
                        }}
                    >
                        <Ionicons name="play" size={14} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.continueBtnText}>
                            {lastReadChapter ? 'Continue Reading' : 'Start Reading'}
                        </Text>
                    </Pressable>

                    {/* Status dropdown */}
                    <View style={styles.statusWrap}>
                        <Pressable
                            style={[styles.statusBtn, isFavorite && { backgroundColor: '#1a7a3c' }]}
                            onPress={() => setStatusMenuOpen(v => !v)}
                        >
                            <Text style={styles.statusBtnText}>
                                {readingStatus || (isFavorite ? 'Reading' : 'Add to List')}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color="#fff" style={{ marginLeft: 4 }} />
                        </Pressable>

                        {statusMenuOpen && (
                            <View style={styles.statusDropdown}>
                                {STATUS_OPTIONS.map(opt => (
                                    <Pressable
                                        key={opt}
                                        style={[styles.statusOption, opt === 'Unfollow' && styles.statusOptionUnfollow]}
                                        onPress={() => handleStatusSelect(opt)}
                                    >
                                        <Text style={[
                                            styles.statusOptionText,
                                            readingStatus === opt && styles.statusOptionActive,
                                            opt === 'Unfollow' && styles.statusOptionUnfollowText,
                                        ]}>
                                            {opt}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Favorite star */}
                    <Pressable onPress={toggleFavorite} style={styles.starBtn}>
                        <Ionicons name={isFavorite ? "star" : "star-outline"} size={24} color="#FFD700" />
                    </Pressable>
                </View>

                {/* Description */}
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.description}>{description}</Text>

                {/* All genres */}
                {mangaData?.genres?.length > 0 && (
                    <View style={styles.tagContainer}>
                        {mangaData.genres.map((genre, idx) => (
                            <View key={`${genre}-${idx}`} style={styles.tag}>
                                <Text style={styles.tagText}>{genre}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Chapters */}
                <View style={styles.chapterHeader}>
                    <Text style={styles.sectionTitle}>Chapters ({total})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={styles.rangeText}>
                            {total ? `${startIdx + 1}–${endIdx} of ${total}` : '0 of 0'}
                        </Text>
                        <Pressable onPress={() => setAscending(v => !v)}>
                            <Text style={styles.toggleOrder}>
                                {ascending ? '↑ Oldest' : '↓ Newest'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {isAsura && !chapters.length && !loading && (
                    <View style={styles.noChaptersBox}>
                        <Ionicons name="alert-circle-outline" size={20} color="#856404" />
                        <Text style={styles.noChaptersText}>No chapters found for this series.</Text>
                    </View>
                )}

                <View style={styles.pagerRow}>
                    <Pressable onPress={() => { if (page > 1) { setPage(p => p - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }} disabled={page <= 1} style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Prev {PAGE_SIZE}</Text>
                    </Pressable>
                    <Text style={styles.pageNum}>Page {page}/{totalPages}</Text>
                    <Pressable onPress={() => { if (page < totalPages) { setPage(p => p + 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }} disabled={page >= totalPages} style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Next {PAGE_SIZE}</Text>
                    </Pressable>
                </View>

                {pagedChapters.length > 0 ? pagedChapters.map((chapter) => {
                    const chapterId = isAsura ? chapter.id : chapter.url;
                    const isLastRead = lastReadChapter === chapterId;
                    return (
                        <Pressable
                            key={chapterId}
                            onPress={() => handleChapterPress(chapter)}
                            style={[styles.chapterRow, isLastRead && styles.chapterRowLastRead]}
                        >
                            <Text style={[styles.chapterTitle, isLastRead && styles.chapterTitleLastRead]}>
                                {displayChapterTitle(chapter)}
                            </Text>
                            {isLastRead && (
                                <View style={styles.lastReadBadge}>
                                    <Ionicons name="bookmark" size={12} color="#4CAF50" />
                                    <Text style={styles.lastReadText}>Last Read</Text>
                                </View>
                            )}
                        </Pressable>
                    );
                }) : (
                    <Text style={{ color: '#666', padding: 16 }}>No chapters found.</Text>
                )}

                <View style={[styles.pagerRow, { marginTop: 8, marginBottom: 24 }]}>
                    <Pressable onPress={() => { if (page > 1) { setPage(p => p - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }} disabled={page <= 1} style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Prev {PAGE_SIZE}</Text>
                    </Pressable>
                    <Text style={styles.pageNum}>Page {page}/{totalPages}</Text>
                    <Pressable onPress={() => { if (page < totalPages) { setPage(p => p + 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }} disabled={page >= totalPages} style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Next {PAGE_SIZE}</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default MangaDetails;

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    topBar: {
        backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16,
        borderBottomColor: '#ddd', borderBottomWidth: 1,
        flexDirection: 'row', alignItems: 'center',
    },
    logoImage: { width: 40, height: 40 },
    container: { paddingBottom: 60 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Hero
    hero: {
        flexDirection: 'row',
        padding: 16,
        gap: 14,
        backgroundColor: '#fff',
    },
    cover: {
        width: 120, height: 175, borderRadius: 8,
        backgroundColor: '#eee', resizeMode: 'cover',
    },
    heroMeta: { flex: 1, justifyContent: 'flex-start', gap: 6 },
    title: { fontSize: 20, fontWeight: '800', color: '#111', lineHeight: 26 },
    sourceLabel: { fontSize: 12, color: '#888' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusBadgeText: { fontSize: 12, color: '#555', fontWeight: '600' },
    genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    genreTag: { backgroundColor: '#f0f0f0', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    genreTagText: { fontSize: 10, color: '#555', fontWeight: '600' },

    // Action row
    actionRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        gap: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0',
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    continueBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#4CAF50', paddingVertical: 10, borderRadius: 8,
    },
    continueBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

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
    starBtn: { padding: 8 },

    // Description
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', paddingHorizontal: 16, marginTop: 20, marginBottom: 6 },
    description: { fontSize: 14, lineHeight: 22, color: '#444', paddingHorizontal: 16, marginBottom: 8 },
    tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
    tag: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    tagText: { fontSize: 12, color: '#444' },

    // Chapters
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
});