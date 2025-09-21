import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangaDexDetails, normalizeMangaDex, searchMangaDex } from '../manga_api/mangadex';
import { searchMangapill, getMangapillManga, proxied } from '../manga_api/mangapill';
import { Ionicons } from '@expo/vector-icons';
import {addFavorite, removeFavorite, getFavorites, getLastReadChapter, saveLastReadChapter, markCompleted, unmarkCompleted, getCompleted} from "./searchStorage";
const PAGE_SIZE = 50;

function extractChapterNumber(ch) {
    const s = ch?.number ?? ch?.name ?? ch?.url ?? '';
    const m = String(s).match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : NaN;
}
function displayChapterTitle(ch) {
    if (ch?.name) return ch.name;
    const slug = (ch?.url || '').split('/').filter(Boolean).pop() || '';
    const pretty = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return pretty || 'Chapter';
}

const MangaDetails = () => {
    const { mangadexId, mangapillUrl: mpUrlParam } = useLocalSearchParams();
    const router = useRouter();
    const scrollRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [ascending, setAscending] = useState(false);
    const [page, setPage] = useState(1);

    const [isFavorite, setIsFavorite] = useState(false);

    const [md, setMd] = useState(null);
    const [mpMeta, setMpMeta] = useState(null);
    const [mangapillUrl, setMangapillUrl] = useState(mpUrlParam || null);
    const [mpChapters, setMpChapters] = useState([]);

    const [lastReadChapter, setLastReadChapter] = useState(null);
    const [isCompleted, setIsCompleted] = useState(false);

    // Create storage key - prefer mangapillUrl, fall back to mangadexId
    const storageKey = useMemo(() => {
        return mangapillUrl || mangadexId;
    }, [mangapillUrl, mangadexId]);

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

    useEffect(() => {
        (async () => {
            const completedList = await getCompleted();
            setIsCompleted(completedList.includes(storageKey));
        })();
    }, [storageKey]);

    // ---- FETCH DETAILS ----
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                let mdNorm = null;
                let mpUrl = mpUrlParam || null;
                let mpFull = null;

                if (mangadexId) {
                    try {
                        const mdRaw = await getMangaDexDetails(mangadexId);
                        mdNorm = mdRaw ? normalizeMangaDex(mdRaw) : null;
                    } catch (e) {
                        console.log('MangaDex fetch failed:', e);
                    }

                    if (!mpUrl && mdNorm?.title) {
                        try {
                            const hits = await searchMangapill(mdNorm.title, 20);
                            if (Array.isArray(hits) && hits.length) mpUrl = hits[0].url;
                        } catch (e) {
                            console.log('Mangapill search by MD title failed:', e);
                        }
                    }

                    if (mpUrl) {
                        try {
                            mpFull = await getMangapillManga(mpUrl);
                        } catch (e) {
                            console.log('Mangapill manga fetch failed:', e);
                        }
                    }
                } else {
                    if (mpUrl) {
                        try {
                            mpFull = await getMangapillManga(mpUrl);
                        } catch (e) {
                            console.log('Mangapill manga fetch failed:', e);
                        }
                    }

                    const guessTitle = mpFull?.title;
                    if (guessTitle) {
                        try {
                            const hits = await searchMangaDex(guessTitle);
                            const mdId = Array.isArray(hits) && hits[0]?.id ? hits[0].id : null;
                            if (mdId) {
                                const mdRaw = await getMangaDexDetails(mdId);
                                mdNorm = mdRaw ? normalizeMangaDex(mdRaw) : null;
                            }
                        } catch (e) {
                            // best-effort only
                        }
                    }
                }

                if (!cancelled) {
                    setMd(mdNorm);
                    setMangapillUrl(mpUrl || null);
                    setMpChapters(Array.isArray(mpFull?.chapters) ? mpFull.chapters : []);
                    setMpMeta(mpFull ? {
                        title: mpFull.title || null,
                        description: mpFull.description || null,
                        cover: mpFull.cover ? proxied(mpFull.cover) : null
                    } : null);
                }
            } catch (err) {
                console.error('Failed to fetch details:', err);
                if (!cancelled) { setMd(null); setMpChapters([]); setMpMeta(null); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mangadexId, mpUrlParam]);

    // ---- FAVORITES ----
    const isMangapillOnly = !md && !!mangapillUrl;

    const title = md?.title
        || mpMeta?.title
        || (isMangapillOnly ? "From Mangapill" : "No title");

    const description = md?.description
        || mpMeta?.description
        || (isMangapillOnly ? "No extra metadata available from Mangapill." : "No description");

    const coverUrl = md?.coverUrl
        || mpMeta?.cover
        || null;


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
                title: title || "From Mangapill",
                description: description || "No metadata available from Mangapill.",
                coverUrl: coverUrl || null,
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

    // Handle chapter press with progress saving
    const handleChapterPress = async (chapter) => {
        try {
            // Save reading progress
            if (storageKey) {
                await saveLastReadChapter(storageKey, chapter.url);
                setLastReadChapter(chapter.url);
            }

            // Navigate to chapter
            router.push(
                `/ReadChapter?chapterUrl=${encodeURIComponent(chapter.url)}&mangapillUrl=${encodeURIComponent(mangapillUrl || "")}&mangadexId=${encodeURIComponent(mangadexId || "")}`
            );
        } catch (error) {
            console.error('Failed to save reading progress:', error);
            // Still navigate even if save fails
            router.push(
                `/ReadChapter?chapterUrl=${encodeURIComponent(lastReadChapter)}&mangapillUrl=${encodeURIComponent(mangapillUrl || "")}&mangadexId=${encodeURIComponent(mangadexId || "")}`
            );
        }
    };

    // ---- CHAPTER SORTING ----
    const sortedChapters = useMemo(() => {
        const arr = Array.isArray(mpChapters) ? [...mpChapters] : [];
        arr.sort((a, b) => {
            const na = extractChapterNumber(a);
            const nb = extractChapterNumber(b);
            if (isNaN(na) && isNaN(nb)) return 0;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            return ascending ? na - nb : nb - na;
        });
        return arr;
    }, [mpChapters, ascending]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(sortedChapters.length / PAGE_SIZE));
        setPage(p => Math.min(Math.max(1, p), totalPages));
    }, [sortedChapters]);

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

    const author = md?.authors?.[0] || 'Unknown';
    const artist = md?.artists?.[0] || 'Unknown';
    const tags = md?.tags || [];

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
                                {!md && mangapillUrl ? (
                                    <View style={styles.sourceBadge}>
                                        <Text style={styles.sourceBadgeText}>from Mangapill</Text>
                                    </View>
                                ) : null}
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

                        <Text style={styles.author}>Author: {author}</Text>
                        <Text style={styles.artist}>Artist: {artist}</Text>

                        {lastReadChapter && (
                            <Pressable
                                style={styles.continueBtn}
                                onPress={() => {
                                    router.push(
                                        `/ReadChapter?chapterUrl=${encodeURIComponent(lastReadChapter)}&mangapillUrl=${encodeURIComponent(mangapillUrl || "")}`
                                    );
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

                {!!tags.length && (
                    <>
                        <Text style={styles.sectionTitle}>Tags</Text>
                        <View style={styles.tagContainer}>
                            {tags.map((t, idx) => (
                                <View key={`${t}-${idx}`} style={styles.tag}>
                                    <Text style={styles.tagText}>{t}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                <View style={styles.chapterHeader}>
                    <Text style={styles.sectionTitle}>Chapters (Mangapill)</Text>
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
                        const n = extractChapterNumber(chapter);
                        const left = isNaN(n) ? 'Ch.' : `Ch. ${n}`;
                        const right = displayChapterTitle(chapter);
                        const isLastRead = lastReadChapter === chapter.url;

                        return (
                            <Pressable
                                key={chapter.url}
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
                                        {left}{right && !String(right).toLowerCase().startsWith('ch') ? ` - ${right}` : ''}
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
                    <Text style={{ color: '#666' }}>
                        {mangapillUrl ? 'No chapters found on Mangapill.' : 'Could not find this on Mangapill.'}
                    </Text>
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
    author: { fontSize: 14, color: '#555', marginBottom: 4 },
    artist: { fontSize: 14, color: '#555', marginBottom: 8 },

    sourceBadge: { marginLeft: 8, backgroundColor: '#eee', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
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
        marginBottom: 8,
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
    followedScroll: {
        paddingVertical: 10,
    },
    followedItem: {
        marginRight: 12,
        alignItems: 'center',
        width: 90,
    },
    followedCover: {
        width: 90,
        height: 120,
        borderRadius: 8,
    },
    followedTitle: {
        fontSize: 12,
        marginTop: 4,
        textAlign: 'center',
    },
    followedChapter: {
        fontSize: 11,
        color: '#4CAF50',
    },
    completedBtn: {
        marginLeft: 12,
    },

});