import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangaInfo, proxied as proxiedAsura } from '../manga_api/asurascans';
import { getMangapillManga, proxied as proxiedMangapill } from '../manga_api/mangapill';
import { Ionicons } from '@expo/vector-icons';
import { addFavorite, removeFavorite, getFavorites, getLastReadChapter, saveLastReadChapter, markCompleted, unmarkCompleted, getCompleted } from "./searchStorage";

const PAGE_SIZE = 50;

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
    const [isCompleted, setIsCompleted] = useState(false);

    const [mangaData, setMangaData] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [lastReadChapter, setLastReadChapter] = useState(null);

    // Determine which source we're using
    const isAsura = source === 'asura' || seriesId;
    const isMangapill = source === 'mangapill' || mangapillUrl;

    // Storage key for favorites/progress
    const storageKey = useMemo(() => {
        return seriesId || mangapillUrl;
    }, [seriesId, mangapillUrl]);

    // Load last read chapter
    useEffect(() => {
        async function loadBookmark() {
            if (!storageKey) return;
            try {
                const saved = await getLastReadChapter(storageKey);
                setLastReadChapter(saved);
            } catch (error) {
                console.error('Failed to load last read chapter:', error);
            }
        }
        loadBookmark();
    }, [storageKey]);

    // Load completed status
    useEffect(() => {
        (async () => {
            const completedList = await getCompleted();
            setIsCompleted(completedList.includes(storageKey));
        })();
    }, [storageKey]);

    // Fetch manga details
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                if (isAsura && seriesId) {
                    // Fetch from AsuraScans
                    const data = await getMangaInfo(seriesId);
                    if (!cancelled) {
                        setMangaData(data);
                        setChapters(data.chapters || []);
                    }
                } else if (isMangapill && mangapillUrl) {
                    // Fetch from MangaPill
                    const data = await getMangapillManga(mangapillUrl);
                    if (!cancelled) {
                        setMangaData(data);
                        setChapters(data.chapters || []);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch manga details:', err);
                if (!cancelled) {
                    setMangaData(null);
                    setChapters([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [seriesId, mangapillUrl, source]);

    // Load favorites
    useEffect(() => {
        (async () => {
            try {
                const favs = await getFavorites();
                const exists = favs.some(f => f.url === storageKey);
                setIsFavorite(exists);
            } catch (err) {
                console.log("Failed to load favorites", err);
            }
        })();
    }, [storageKey]);

    const toggleFavorite = async () => {
        try {
            const favData = {
                url: storageKey,
                title: mangaData?.title || "Manga",
                description: mangaData?.description || "No description available.",
                coverUrl: getCoverUrl(),
            };

            if (isFavorite) {
                await removeFavorite(storageKey);
                setIsFavorite(false);
            } else {
                await addFavorite(favData);
                setIsFavorite(true);
            }
        } catch (err) {
            console.log("Favorite toggle failed", err);
        }
    };

    const handleChapterPress = async (chapter) => {
        try {
            const chapterId = isAsura ? chapter.id : chapter.url;

            if (storageKey) {
                await saveLastReadChapter(storageKey, chapterId);
                setLastReadChapter(chapterId);
            }

            // Navigate with appropriate params based on source
            if (isAsura) {
                router.push(
                    `/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(chapter.id)}&source=asura`
                );
            } else {
                router.push(
                    `/ReadChapter?chapterUrl=${encodeURIComponent(chapter.url)}&mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill`
                );
            }
        } catch (error) {
            console.error('Failed to save reading progress:', error);
        }
    };

    const getCoverUrl = () => {
        if (!mangaData) return null;
        if (isAsura) {
            return mangaData.image ? proxiedAsura(mangaData.image) : null;
        } else {
            return mangaData.cover ? proxiedMangapill(mangaData.cover) : null;
        }
    };

    // Chapter sorting
    const sortedChapters = useMemo(() => {
        const arr = [...chapters];
        arr.sort((a, b) => {
            const na = extractChapterNumber(a);
            const nb = extractChapterNumber(b);
            if (isNaN(na) && isNaN(nb)) return 0;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            return ascending ? na - nb : nb - na;
        });
        return arr;
    }, [chapters, ascending]);

    const total = sortedChapters.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startIdx = (page - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, total);
    const pagedChapters = sortedChapters.slice(startIdx, endIdx);

    const goPrevPage = () => {
        if (page > 1) {
            setPage(p => p - 1);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    const goNextPage = () => {
        if (page < totalPages) {
            setPage(p => p + 1);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
    };

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
    }

    const title = mangaData?.title || 'No title';
    const description = mangaData?.description || 'No description';
    const coverUrl = getCoverUrl();
    const sourceLabel = isAsura ? 'AsuraScans' : 'MangaPill';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
                <View style={styles.headerSection}>
                    {coverUrl && <Image source={{ uri: coverUrl }} style={styles.cover} />}
                    <View style={styles.metaInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>{title}</Text>
                                <View style={styles.sourceBadge}>
                                    <Text style={styles.sourceBadgeText}>from {sourceLabel}</Text>
                                </View>
                            </View>

                            <Pressable onPress={toggleFavorite}>
                                <Ionicons
                                    name={isFavorite ? "star" : "star-outline"}
                                    size={28}
                                    color="#FFD700"
                                />
                            </Pressable>

                            <Pressable
                                onPress={async () => {
                                    if (isCompleted) {
                                        await unmarkCompleted(storageKey);
                                        setIsCompleted(false);
                                    } else {
                                        await markCompleted(storageKey);
                                        setIsCompleted(true);
                                    }
                                }}
                                style={styles.completedBtn}
                            >
                                <Ionicons
                                    name={isCompleted ? "checkmark-circle" : "checkmark-circle-outline"}
                                    size={28}
                                    color="#4CAF50"
                                />
                            </Pressable>
                        </View>

                        {lastReadChapter && (
                            <Pressable
                                style={styles.continueBtn}
                                onPress={() => {
                                    if (isAsura) {
                                        router.push(
                                            `/ReadChapter?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(lastReadChapter)}&source=asura`
                                        );
                                    } else {
                                        router.push(
                                            `/ReadChapter?chapterUrl=${encodeURIComponent(lastReadChapter)}&mangapillUrl=${encodeURIComponent(mangapillUrl)}&source=mangapill`
                                        );
                                    }
                                }}
                            >
                                <Ionicons name="play-circle" size={16} color="#fff" style={{ marginRight: 4 }} />
                                <Text style={styles.continueBtnText}>Continue Reading</Text>
                            </Pressable>
                        )}
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Description</Text>
                <ScrollView style={styles.descriptionBox}>
                    <Text style={styles.description}>{description}</Text>
                </ScrollView>

                {mangaData?.genres && mangaData.genres.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Genres</Text>
                        <View style={styles.tagContainer}>
                            {mangaData.genres.map((genre, idx) => (
                                <View key={`${genre}-${idx}`} style={styles.tag}>
                                    <Text style={styles.tagText}>{genre}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <View style={styles.chapterHeader}>
                    <Text style={styles.sectionTitle}>Chapters ({sourceLabel})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={styles.rangeText}>
                            {total ? `${startIdx + 1}–${endIdx} of ${total}` : '0 of 0'}
                        </Text>
                        <Pressable onPress={() => setAscending(v => !v)}>
                            <Text style={styles.toggleOrder}>
                                {ascending ? '↑ Oldest First' : '↓ Newest First'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.pagerRow}>
                    <Pressable onPress={goPrevPage} disabled={page <= 1} style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Prev {PAGE_SIZE}</Text>
                    </Pressable>
                    <Text style={styles.pageNum}>Page {page}/{totalPages}</Text>
                    <Pressable onPress={goNextPage} disabled={page >= totalPages} style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Next {PAGE_SIZE}</Text>
                    </Pressable>
                </View>

                {!!pagedChapters.length ? (
                    pagedChapters.map((chapter) => {
                        const chapterId = isAsura ? chapter.id : chapter.url;
                        const isLastRead = lastReadChapter === chapterId;
                        const chapterTitle = displayChapterTitle(chapter);

                        return (
                            <Pressable
                                key={chapterId}
                                onPress={() => handleChapterPress(chapter)}
                                style={[
                                    styles.chapterRow,
                                    isLastRead && styles.chapterRowLastRead
                                ]}
                            >
                                <View style={styles.chapterInfo}>
                                    <Text style={[
                                        styles.chapterTitle,
                                        isLastRead && styles.chapterTitleLastRead
                                    ]}>
                                        {chapterTitle}
                                    </Text>
                                    {isLastRead && (
                                        <View style={styles.lastReadBadge}>
                                            <Ionicons name="bookmark" size={12} color="#4CAF50" />
                                            <Text style={styles.lastReadText}>Last Read</Text>
                                        </View>
                                    )}
                                </View>
                            </Pressable>
                        );
                    })
                ) : (
                    <Text style={{ color: '#666' }}>No chapters found.</Text>
                )}

                <View style={[styles.pagerRow, { marginTop: 8, marginBottom: 24 }]}>
                    <Pressable onPress={goPrevPage} disabled={page <= 1} style={[styles.pagerBtn, page <= 1 && styles.pagerBtnDisabled]}>
                        <Text style={styles.pagerText}>Prev {PAGE_SIZE}</Text>
                    </Pressable>
                    <Text style={styles.pageNum}>Page {page}/{totalPages}</Text>
                    <Pressable onPress={goNextPage} disabled={page >= totalPages} style={[styles.pagerBtn, page >= totalPages && styles.pagerBtnDisabled]}>
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
    header: {
        backgroundColor: '#fff',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomColor: '#ddd',
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoImage: { width: 40, height: 40 },
    container: { padding: 16, paddingBottom: 60 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerSection: { flexDirection: 'row', marginBottom: 16 },
    cover: {
        width: 110, height: 160, resizeMode: 'cover',
        borderRadius: 8, marginRight: 16, backgroundColor: '#eee',
    },
    metaInfo: { flex: 1, justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, color: '#1E1E1E' },
    sourceBadge: { backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
    sourceBadgeText: { fontSize: 12, color: '#555' },
    sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 8, color: '#1E1E1E' },
    descriptionBox: {
        maxHeight: 200, borderWidth: 1, borderColor: '#eee',
        borderRadius: 6, padding: 10, backgroundColor: '#fdfdfd',
    },
    description: { fontSize: 15, lineHeight: 22, color: '#444' },
    tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
        backgroundColor: '#e0e0e0', paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 16, marginRight: 8, marginBottom: 8,
    },
    tagText: { fontSize: 13, color: '#333' },
    chapterHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 20, marginBottom: 8,
    },
    toggleOrder: { color: '#007AFF', fontSize: 14 },
    rangeText: { color: '#666', fontSize: 12 },
    chapterRow: {
        paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1,
        borderBottomColor: '#eee', backgroundColor: '#f9f9f9',
        borderRadius: 6, marginBottom: 6,
    },
    chapterRowLastRead: {
        backgroundColor: '#f0f9ff',
        borderLeftWidth: 4,
        borderLeftColor: '#4CAF50',
    },
    chapterInfo: { flexDirection: 'column' },
    chapterTitle: { fontSize: 16, color: '#000', fontWeight: '500' },
    chapterTitleLastRead: { color: '#2E7D32' },
    lastReadBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    lastReadText: {
        fontSize: 12,
        color: '#4CAF50',
        fontWeight: '600',
        marginLeft: 4,
    },
    pagerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginVertical: 8,
    },
    pagerBtn: {
        flex: 1, backgroundColor: '#efefef', paddingVertical: 10,
        borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ddd',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#111', fontWeight: '600' },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#444' },
    continueBtn: {
        marginTop: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    continueBtnText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    completedBtn: {
        marginLeft: 12,
    },
});