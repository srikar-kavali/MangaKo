// MangaDetails.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangaDexDetails, normalizeMangaDex } from '../manga_api/mangadex';
import { searchMangapill, getMangapillManga } from '../manga_api/mangapill';

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
    const [page, setPage] = useState(1); // <-- pagination page (1-based)

    const [md, setMd] = useState(null);
    const [mangapillUrl, setMangapillUrl] = useState(mpUrlParam || null);
    const [mpChapters, setMpChapters] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const mdRaw = await getMangaDexDetails(mangadexId);
                const mdNorm = mdRaw ? normalizeMangaDex(mdRaw) : null;
                if (!cancelled) setMd(mdNorm);

                let mpUrl = mpUrlParam ?? null;
                if (!mpUrl && mdNorm?.title) {
                    const hits = await searchMangapill(mdNorm.title, 20);
                    if (Array.isArray(hits) && hits.length > 0) mpUrl = hits[0].url;
                }
                if (!cancelled) setMangapillUrl(mpUrl || null);

                if (mpUrl) {
                    const mp = await getMangapillManga(mpUrl);
                    if (!cancelled) setMpChapters(Array.isArray(mp?.chapters) ? mp.chapters : []);
                } else {
                    if (!cancelled) setMpChapters([]);
                }
            } catch (err) {
                console.error('Failed to fetch details:', err);
                if (!cancelled) { setMd(null); setMpChapters([]); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mangadexId, mpUrlParam]);

    const toggleOrder = () => setAscending(v => !v);

    // full sorted list
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

    // clamp/reset page when list or sort order changes
    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(sortedChapters.length / PAGE_SIZE));
        setPage(p => Math.min(Math.max(1, p), totalPages));
    }, [sortedChapters]);

    // current page slice
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
    if (!md) {
        return <View style={styles.centered}><Text>Something went wrong.</Text></View>;
    }

    const title = md.title || 'No title';
    const description = md.description || 'No description';
    const coverUrl = md.coverUrl || null;
    const author = md.authors?.[0] || 'Unknown';
    const artist = md.artists?.[0] || 'Unknown';
    const tags = md.tags || [];

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header with logo */}
            <View style={styles.header}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
            </View>

            {/* Scrollable manga info */}
            <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
                <View style={styles.headerSection}>
                    {coverUrl && <Image source={{ uri: coverUrl }} style={styles.cover} />}
                    <View style={styles.metaInfo}>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.author}>Author: {author}</Text>
                        <Text style={styles.artist}>Artist: {artist}</Text>
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
                        <Pressable onPress={toggleOrder}>
                            <Text style={styles.toggleOrder}>
                                {ascending ? '↑ Oldest First' : '↓ Newest First'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Page controls (top) */}
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

                        return (
                            <Pressable
                                key={chapter.url}
                                onPress={() =>
                                    router.push(
                                        `/ReadChapter?chapterUrl=${encodeURIComponent(chapter.url)}&mangadexId=${mangadexId}&mangapillUrl=${encodeURIComponent(mangapillUrl || '')}`
                                    )
                                }
                                style={styles.chapterRow}
                            >
                                <View style={styles.chapterInfo}>
                                    <Text style={styles.chapterTitle}>
                                        {left}{right && !String(right).toLowerCase().startsWith('ch') ? ` - ${right}` : ''}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })
                ) : (
                    <Text style={{ color: '#666' }}>
                        {mangapillUrl ? 'No chapters found on Mangapill.' : 'Could not find this on Mangapill.'}
                    </Text>
                )}

                {/* Page controls (bottom) */}
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
    artist: { fontSize: 14, color: '#555' },

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
    chapterInfo: { flexDirection: 'column' },
    chapterTitle: { fontSize: 16, color: '#000', fontWeight: '500' },

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
});
