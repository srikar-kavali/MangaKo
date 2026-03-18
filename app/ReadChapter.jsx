import { useState, useEffect, useRef } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangapillManga, getChapterPagesMangapill, proxied as proxiedMangapill } from "../manga_api/mangapill";
import { updateLastRead } from "./searchStorage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BACKEND = process.env.EXPO_PUBLIC_CHAPTERS_API;

const ReadChapter = () => {
    const params = useLocalSearchParams();
    const { seriesId, chapterId, chapterUrl, mangapillUrl, source } = params;
    const router = useRouter();
    const scrollRef = useRef(null);

    const isAsura = source === 'asura' || !!seriesId;
    const isMangapill = source === 'mangapill' || !!mangapillUrl;

    const [selectedChapterId, setSelectedChapterId] = useState(chapterId || chapterUrl || null);
    const [pages, setPages] = useState([]);
    const [allChapters, setAllChapters] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);

    useEffect(() => {
        if (selectedChapterId) {
            const storageKey = seriesId || mangapillUrl;
            if (storageKey) {
                updateLastRead(storageKey, selectedChapterId)
                    .catch(e => console.error("Bookmark save failed:", e));
            }
        }
    }, [selectedChapterId, seriesId, mangapillUrl]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!selectedChapterId) { setPages([]); return; }
            setLoadingPages(true);
            scrollRef.current?.scrollTo({ y: 0, animated: false });
            try {
                let urls = [];
                if (isAsura && seriesId) {
                    const res = await fetch(
                        `${BACKEND}/api/asura-chapters?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(selectedChapterId)}`
                    );
                    const json = await res.json();
                    urls = json.pages || [];
                } else if (isMangapill) {
                    const raw = await getChapterPagesMangapill(selectedChapterId);
                    urls = (Array.isArray(raw) ? raw : []).map(u => proxiedMangapill(u));
                }
                if (!cancelled) {
                    setPages(urls);
                    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 100);
                }
            } catch (e) {
                console.error("Failed to load chapter pages:", e);
                if (!cancelled) setPages([]);
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedChapterId, seriesId, mangapillUrl, source]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!seriesId && !mangapillUrl) return;
            setLoadingChapters(true);
            try {
                let chapters = [];
                if (isAsura && seriesId) {
                    const res = await fetch(
                        `${BACKEND}/api/asura-chapters?seriesId=${encodeURIComponent(seriesId)}`
                    );
                    const json = await res.json();
                    chapters = (json.chapters || []).map(ch => ({
                        id: ch.id,
                        title: `Chapter ${ch.id}`,
                        number: ch.number ?? parseFloat(ch.id) ?? 0,
                    }));
                } else if (isMangapill && mangapillUrl) {
                    const data = await getMangapillManga(mangapillUrl);
                    chapters = (data.chapters || []).map(ch => ({
                        id: ch.url,
                        title: (() => {
                            const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                            const m = slug.match(/(\d+(\.\d+)?)/);
                            return `Ch. ${m ? m[1] : '–'}`;
                        })(),
                        number: (() => {
                            const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                            const m = slug.match(/(\d+(\.\d+)?)/);
                            return m ? parseFloat(m[1]) : 0;
                        })()
                    }));
                }
                chapters.sort((a, b) => a.number - b.number);
                if (!cancelled) {
                    setAllChapters(chapters);
                    if (!selectedChapterId && chapters.length) {
                        setSelectedChapterId(chapters[0].id);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch chapters list:", e);
            } finally {
                if (!cancelled) setLoadingChapters(false);
            }
        })();
        return () => { cancelled = true; };
    }, [seriesId, mangapillUrl, source]);

    const idx = allChapters.findIndex(ch => ch.id === selectedChapterId);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < allChapters.length - 1;
    const titleLabel = idx >= 0 ? allChapters[idx].title : (chapterId ? `Chapter ${chapterId}` : "Chapter");

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
                <Text style={styles.headerText}>{titleLabel}</Text>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {loadingPages && (
                    <ActivityIndicator size="large" color="#ccc" style={{ marginVertical: 40 }} />
                )}

                {!loadingPages && pages.map((url, i) => (
                    <Image
                        key={url || i}
                        source={{ uri: url }}
                        style={styles.pageImage}
                        resizeMode="contain"
                        onError={(e) => console.warn("Image error:", url, e.nativeEvent?.error)}
                    />
                ))}

                {!loadingPages && pages.length === 0 && (
                    <Text style={styles.noPages}>No pages found for this chapter.</Text>
                )}

                <View style={styles.pagerRow}>
                    <Pressable
                        disabled={!hasPrev}
                        onPress={() => hasPrev && setSelectedChapterId(allChapters[idx - 1].id)}
                        style={[styles.pagerBtn, !hasPrev && styles.pagerBtnDisabled]}
                    >
                        <Text style={styles.pagerText}>← Previous</Text>
                    </Pressable>

                    <Text style={styles.pageNum}>
                        {idx >= 0 ? `${idx + 1} / ${allChapters.length}` : ''}
                    </Text>

                    {hasNext ? (
                        <Pressable
                            onPress={() => setSelectedChapterId(allChapters[idx + 1].id)}
                            style={styles.pagerBtn}
                        >
                            <Text style={styles.pagerText}>Next →</Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => router.replace('/tabs/home')}
                            style={[styles.pagerBtn, { backgroundColor: '#2a4d3a' }]}
                        >
                            <Text style={styles.pagerText}>Home</Text>
                        </Pressable>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ReadChapter;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        padding: 12, backgroundColor: '#111',
        borderBottomWidth: 1, borderBottomColor: '#333',
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    logoImage: { width: 36, height: 36, resizeMode: 'contain' },
    headerText: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
    scroll: { alignItems: 'stretch', paddingBottom: 24, backgroundColor: '#000' },
    pageImage: {
        width: SCREEN_WIDTH * 0.75,
        alignSelf: 'center',
        height: undefined,
        aspectRatio: 0.7,
        marginBottom: 2,
        backgroundColor: '#000',
    },
    noPages: { color: "#888", marginTop: 40, textAlign: 'center', fontSize: 15 },
    pagerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginVertical: 16, paddingHorizontal: 12, width: '100%',
    },
    pagerBtn: {
        flex: 1, backgroundColor: '#1e1e1e', paddingVertical: 12,
        borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: '#333',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#fff', fontWeight: '600' },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#aaa' },
});