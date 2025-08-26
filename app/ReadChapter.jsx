import { useState, useEffect, useRef } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangapillManga, getChapterPagesMangapill, proxied } from "../manga_api/mangapill";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const ReadChapter = () => {
    const params = useLocalSearchParams();
    const rawChapterUrl = Array.isArray(params.chapterUrl) ? params.chapterUrl[0] : params.chapterUrl || "";
    const mangapillUrl = Array.isArray(params.mangapillUrl) ? params.mangapillUrl[0] : params.mangapillUrl || "";
    const router = useRouter();
    const scrollRef = useRef(null);

    const [selectedChapterUrl, setSelectedChapterUrl] = useState(rawChapterUrl || null);
    const [pages, setPages] = useState([]); // Store {url, width, height, aspectRatio}
    const [pickerItems, setPickerItems] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);

    // Helper function to get image dimensions
    const getImageDimensions = (url) => {
        return new Promise((resolve) => {
            Image.getSize(
                url,
                (width, height) => {
                    const aspectRatio = width / height;
                    resolve({ url, width, height, aspectRatio });
                },
                (error) => {
                    console.warn("Failed to get image dimensions for:", url, error);
                    // Fallback to default aspect ratio
                    resolve({ url, width: SCREEN_WIDTH, height: SCREEN_WIDTH / 0.7, aspectRatio: 0.7 });
                }
            );
        });
    };

    // Fetch pages for selected chapter
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapterUrl) {
                    setPages([]);
                    return;
                }
                setLoadingPages(true);

                // Scroll to top immediately when chapter changes
                scrollRef.current?.scrollTo({ y: 0, animated: false });

                const urls = await getChapterPagesMangapill(selectedChapterUrl);
                console.log("chapter_pages ->", selectedChapterUrl, Array.isArray(urls) ? urls.length : urls);

                // Map through proxy and get dimensions
                const proxiedUrls = (Array.isArray(urls) ? urls : []).map(u => proxied(u));

                // Get dimensions for all images
                const pagesWithDimensions = await Promise.all(
                    proxiedUrls.map(url => getImageDimensions(url))
                );

                if (!cancelled) {
                    setPages(pagesWithDimensions);
                    // Ensure we stay at top after content loads
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
    }, [selectedChapterUrl]);

    // Fetch chapters list (for Prev/Next)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!mangapillUrl) return;
                setLoadingChapters(true);
                const mp = await getMangapillManga(mangapillUrl);
                const items = (mp?.chapters || []).map(ch => ({
                    key: ch.url,
                    value: ch.url,
                    number: (() => {
                        const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                        const m = slug.match(/(\d+(\.\d+)?)/);
                        return m ? parseFloat(m[1]) : 0;
                    })(),
                    label: (() => {
                        const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                        const m = slug.match(/(\d+(\.\d+)?)/);
                        const n = m ? m[1] : "–";
                        return `Ch. ${n}`;
                    })(),
                }));

                // Sort chapters by number in ascending order (1, 2, 3, ... latest)
                const sortedItems = items.sort((a, b) => a.number - b.number);

                if (!cancelled) {
                    setPickerItems(sortedItems);
                    if (!rawChapterUrl && sortedItems.length) {
                        // Default to the latest chapter (last in sorted array)
                        setSelectedChapterUrl(sortedItems[sortedItems.length - 1].value);
                    }
                }
                console.log("chapters count ->", sortedItems.length, "latest:", sortedItems[sortedItems.length - 1]?.label);
            } catch (e) {
                console.error("Failed to fetch chapters list:", e);
            } finally {
                if (!cancelled) setLoadingChapters(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mangapillUrl, rawChapterUrl]);

    // Enhanced image styling for manhwa support
    const getImageStyle = (page) => {
        if (!page.width || !page.height) {
            // Fallback for images without dimensions
            return {
                width: SCREEN_WIDTH,
                height: SCREEN_WIDTH / 0.7,
                marginBottom: 2, // Reduced gap for manhwa
                backgroundColor: '#000'
            };
        }

        const { width, height, aspectRatio } = page;

        // Manhwa detection - typically very tall images (height much greater than width)
        const isManhwa = aspectRatio < 0.8; // Width/height ratio less than 0.8 suggests manhwa

        if (isManhwa) {
            // For manhwa (Korean webtoons) - use full width, preserve aspect ratio
            const calculatedHeight = SCREEN_WIDTH / aspectRatio;

            // Don't limit height for manhwa as they're meant to be scrolled vertically
            return {
                width: SCREEN_WIDTH,
                height: calculatedHeight,
                marginBottom: 2, // Very small gap between pages for smooth reading
                backgroundColor: '#000'
            };
        }

        // For double spreads (very wide images)
        if (aspectRatio > 1.2) {
            return {
                width: SCREEN_WIDTH,
                height: SCREEN_WIDTH / aspectRatio,
                marginBottom: 8, // Normal gap for manga
                backgroundColor: '#000'
            };
        }

        // For normal manga pages
        const calculatedHeight = SCREEN_WIDTH / aspectRatio;
        const maxHeight = SCREEN_HEIGHT * 0.8; // Limit to 80% of screen height for manga

        if (calculatedHeight > maxHeight) {
            // If calculated height is too tall for manga, scale down
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
            marginBottom: 8, // Normal gap for manga
            backgroundColor: '#000'
        };
    };

    const idx = pickerItems.findIndex(i => i.value === selectedChapterUrl);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < pickerItems.length - 1;
    const titleLabel = idx >= 0 ? pickerItems[idx].label : "Ch –";

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
                showsVerticalScrollIndicator={false} // Hide scrollbar for cleaner manhwa reading
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
                        onLoad={() => console.log("Image loaded:", page.url)}
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
                                setSelectedChapterUrl(pickerItems[idx - 1].value);
                                // Scroll will happen automatically in useEffect
                            }
                        }}
                        style={[styles.pagerBtn, !hasPrev && styles.pagerBtnDisabled]}
                    >
                        <Text style={styles.pagerText}>Previous</Text>
                    </Pressable>

                    <Text style={styles.pageNum}>
                        {idx >= 0 ? `${idx + 1} / ${pickerItems.length}` : ''}
                    </Text>

                    {hasNext ? (
                        <Pressable
                            onPress={() => {
                                setSelectedChapterUrl(pickerItems[idx + 1].value);
                                // Scroll will happen automatically in useEffect
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
        backgroundColor: '#000' // Ensure black background for reading
    },

    pagerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginVertical: 16, // Increased margin for better separation
        paddingHorizontal: 12,
        width: '100%',
    },
    pagerBtn: {
        flex: 1,
        backgroundColor: '#1e1e1e',
        paddingVertical: 12, // Slightly larger buttons
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#fff', fontWeight: '600' },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#aaa' },
});