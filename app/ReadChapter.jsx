import { useState, useEffect, useRef } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangaInfo, getChapterPages, proxied as proxiedAsura } from "../manga_api/asurascans";
import { getMangapillManga, getChapterPagesMangapill, proxied as proxiedMangapill } from "../manga_api/mangapill";
import { updateLastRead } from "./searchStorage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const ReadChapter = () => {
    const params = useLocalSearchParams();
    const { seriesId, chapterId, chapterUrl, mangapillUrl, source } = params;
    const router = useRouter();
    const scrollRef = useRef(null);

    const isAsura = source === 'asura' || seriesId;
    const isMangapill = source === 'mangapill' || mangapillUrl;

    const [selectedChapterId, setSelectedChapterId] = useState(chapterId || chapterUrl || null);
    const [pages, setPages] = useState([]);
    const [allChapters, setAllChapters] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);

    // Helper to get image dimensions
    const getImageDimensions = (url) => {
        return new Promise((resolve) => {
            Image.getSize(
                url,
                (width, height) => {
                    const aspectRatio = width / height;
                    resolve({ url, width, height, aspectRatio });
                },
                (error) => {
                    console.warn("Failed to get image dimensions:", url, error);
                    resolve({ url, width: SCREEN_WIDTH, height: SCREEN_WIDTH / 0.7, aspectRatio: 0.7 });
                }
            );
        });
    };

    // Update last read when chapter changes
    useEffect(() => {
        if (selectedChapterId) {
            const storageKey = seriesId || mangapillUrl;
            if (storageKey) {
                updateLastRead(storageKey, selectedChapterId)
                    .catch(e => console.error("Bookmark save failed:", e));
            }
        }
    }, [selectedChapterId, seriesId, mangapillUrl]);

    // Fetch pages for selected chapter
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapterId) {
                    setPages([]);
                    return;
                }

                setLoadingPages(true);
                scrollRef.current?.scrollTo({ y: 0, animated: false });

                let urls = [];

                if (isAsura && seriesId) {
                    // AsuraScans
                    urls = await getChapterPages(seriesId, selectedChapterId);
                    urls = urls.map(u => proxiedAsura(u));
                } else if (isMangapill) {
                    // MangaPill
                    urls = await getChapterPagesMangapill(selectedChapterId);
                    urls = (Array.isArray(urls) ? urls : []).map(u => proxiedMangapill(u));
                }

                const pagesWithDimensions = await Promise.all(
                    urls.map(url => getImageDimensions(url))
                );

                if (!cancelled) {
                    setPages(pagesWithDimensions);
                    setTimeout(() => {
                        scrollRef.current?.scrollTo({ y: 0, animated: false });
                    }, 100);
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

    // Fetch chapters list
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!seriesId && !mangapillUrl) return;

                setLoadingChapters(true);

                let chapters = [];

                if (isAsura && seriesId) {
                    // AsuraScans
                    const data = await getMangaInfo(seriesId);
                    chapters = (data.chapters || []).map(ch => ({
                        id: ch.id,
                        title: ch.title,
                        number: parseFloat(ch.id.match(/(\d+(\.\d+)?)/)?.[1] || 0)
                    }));
                } else if (isMangapill && mangapillUrl) {
                    // MangaPill
                    const data = await getMangapillManga(mangapillUrl);
                    chapters = (data.chapters || []).map(chaw => ({
                        id: ch.url,
                        title: (() => {
                            const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                            const m = slug.match(/(\d+(\.\d+)?)/);
                            const n = m ? m[1] : "–";
                            return `Ch. ${n}`;
                        })(),
                        number: (() => {
                            const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                            const m = slug.match(/(\d+(\.\d+)?)/);
                            return m ? parseFloat(m[1]) : 0;
                        })()
                    }));
                }

                // Sort chapters ascending
                chapters.sort((a, b) => a.number - b.number);

                if (!cancelled) {
                    setAllChapters(chapters);
                    if (!selectedChapterId && chapters.length) {
                        setSelectedChapterId(chapters[chapters.length - 1].id);
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

    // Enhanced image styling
    const getImageStyle = (page) => {
        if (!page.width || !page.height) {
            return {
                width: SCREEN_WIDTH,
                height: SCREEN_WIDTH / 0.7,
                marginBottom: 2,
                backgroundColor: '#000'
            };
        }

        const { aspectRatio } = page;
        const isManhwa = aspectRatio < 0.8;

        if (isManhwa) {
            const calculatedHeight = SCREEN_WIDTH / aspectRatio;
            return {
                width: SCREEN_WIDTH,
                height: calculatedHeight,
                marginBottom: 2,
                backgroundColor: '#000'
            };
        }

        if (aspectRatio > 1.2) {
            return {
                width: SCREEN_WIDTH,
                height: SCREEN_WIDTH / aspectRatio,
                marginBottom: 8,
                backgroundColor: '#000'
            };
        }

        const calculatedHeight = SCREEN_WIDTH / aspectRatio;
        const maxHeight = SCREEN_HEIGHT * 0.8;

        if (calculatedHeight > maxHeight) {
            const scaledWidth = maxHeight * aspectRatio;
            return {
                width: scaledWidth,
                height: maxHeight,
                alignSelf: 'center',
                marginBottom: 8,
                backgroundColor: '#000'
            };
        }

        return {
            width: SCREEN_WIDTH,
            height: calculatedHeight,
            marginBottom: 8,
            backgroundColor: '#000'
        };
    };

    const idx = allChapters.findIndex(ch => ch.id === selectedChapterId);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < allChapters.length - 1;
    const titleLabel = idx >= 0 ? allChapters[idx].title : "Chapter";

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
                <Text style={styles.headerText}>{titleLabel}</Text>
            </View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
            >
                {loadingPages && (
                    <ActivityIndicator size="large" color="#ccc" style={{ marginVertical: 16 }} />
                )}

                {pages.map((page, i) => (
                    <Image
                        key={page.url || i}
                        source={{ uri: page.url }}
                        style={getImageStyle(page)}
                        resizeMode="contain"
                        onError={(e) => console.warn("Image error:", page.url, e.nativeEvent?.error)}
                    />
                ))}

                {!loadingPages && pages.length === 0 && (
                    <Text style={{ color: "#888", marginTop: 16, textAlign: 'center' }}>No pages found.</Text>
                )}

                <View style={styles.pagerRow}>
                    <Pressable
                        disabled={!hasPrev}
                        onPress={() => {
                            if (hasPrev) {
                                setSelectedChapterId(allChapters[idx - 1].id);
                            }
                        }}
                        style={[styles.pagerBtn, !hasPrev && styles.pagerBtnDisabled]}
                    >
                        <Text style={styles.pagerText}>Previous</Text>
                    </Pressable>

                    <Text style={styles.pageNum}>
                        {idx >= 0 ? `${idx + 1} / ${allChapters.length}` : ''}
                    </Text>

                    {hasNext ? (
                        <Pressable
                            onPress={() => {
                                setSelectedChapterId(allChapters[idx + 1].id);
                            }}
                            style={styles.pagerBtn}
                        >
                            <Text style={styles.pagerText}>Next</Text>
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
        padding: 12,
        backgroundColor: '#111',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    logoImage: { width: 36, height: 36, resizeMode: 'contain' },
    headerText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    scroll: {
        alignItems: 'stretch',
        paddingBottom: 24,
        backgroundColor: '#000'
    },
    pagerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginVertical: 16,
        paddingHorizontal: 12,
        width: '100%',
    },
    pagerBtn: {
        flex: 1,
        backgroundColor: '#1e1e1e',
        paddingVertical: 12,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#fff', fontWeight: '600' },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#aaa' },
});