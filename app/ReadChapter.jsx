import { useState, useEffect } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangapillManga, getChapterPagesMangapill, proxied } from "../manga_api/mangapill";

const ReadChapter = () => {
    const params = useLocalSearchParams();
    const rawChapterUrl = Array.isArray(params.chapterUrl) ? params.chapterUrl[0] : params.chapterUrl || "";
    const mangapillUrl = Array.isArray(params.mangapillUrl) ? params.mangapillUrl[0] : params.mangapillUrl || "";
    const router = useRouter();

    const [selectedChapterUrl, setSelectedChapterUrl] = useState(rawChapterUrl || null);
    const [pageUrls, setPageUrls] = useState([]);
    const [pickerItems, setPickerItems] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapterUrl) { setPageUrls([]); return; }
                setLoadingPages(true);
                const urls = await getChapterPagesMangapill(selectedChapterUrl);
                console.log("chapter_pages ->", selectedChapterUrl, Array.isArray(urls) ? urls.length : urls);

                const proxiedUrls = (Array.isArray(urls) ? urls : []).map(u => proxied(u));
                if (!cancelled) setPageUrls(proxiedUrls);
            } catch (e) {
                console.error("Failed to load chapter pages:", e);
                if (!cancelled) setPageUrls([]);
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedChapterUrl]);

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
                    // build a friendly label from URL if number missing
                    label: (() => {
                        const slug = String(ch.url).split("/").filter(Boolean).pop() || "";
                        const m = slug.match(/(\d+(\.\d+)?)/);
                        const n = m ? m[1] : "–";
                        return `Ch. ${n}`;
                    })(),
                }));
                if (!cancelled) {
                    setPickerItems(items);
                    if (!rawChapterUrl && items.length) setSelectedChapterUrl(items[0].value);
                }
                console.log("chapters count ->", items.length);
            } catch (e) {
                console.error("Failed to fetch chapters list:", e);
            } finally {
                if (!cancelled) setLoadingChapters(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mangapillUrl, rawChapterUrl]);

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

            <ScrollView contentContainerStyle={styles.scroll}>
                {loadingPages && (
                    <ActivityIndicator size="large" color="#ccc" style={{ marginVertical: 16 }} />
                )}

                {pageUrls.map((url, i) => (
                    <Image
                        key={url || i}
                        source={{ uri: url }}
                        style={styles.pageImage}
                        resizeMode="contain"
                        onError={(e) => console.warn("Image error:", url, e.nativeEvent?.error)}
                    />
                ))}

                {!loadingPages && pageUrls.length === 0 && (
                    <Text style={{ color: "#888", marginTop: 16 }}>No pages found.</Text>
                )}

                <View style={styles.pagerRow}>
                    <Pressable
                        disabled={!hasPrev}
                        onPress={() => hasPrev && setSelectedChapterUrl(pickerItems[idx - 1].value)}
                        style={[styles.pagerBtn, !hasPrev && styles.pagerBtnDisabled]}
                    >
                        <Text style={styles.pagerText}>Previous</Text>
                    </Pressable>

                    <Text style={styles.pageNum}>
                        {idx >= 0 ? `${idx + 1} / ${pickerItems.length}` : ''}
                    </Text>

                    <Pressable
                        disabled={!hasNext}
                        onPress={() => hasNext && setSelectedChapterUrl(pickerItems[idx + 1].value)}
                        style={[styles.pagerBtn, !hasNext && styles.pagerBtnDisabled]}
                    >
                        <Text style={styles.pagerText}>Next</Text>
                    </Pressable>
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

    scroll: { alignItems: 'center', paddingBottom: 24 },
    pageImage: { width: '100%', height: undefined, aspectRatio: 0.7, marginBottom: 10, backgroundColor: '#000' },

    pagerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginVertical: 10,
        paddingHorizontal: 12,
        width: '100%',
    },
    pagerBtn: {
        flex: 1,
        backgroundColor: '#1e1e1e',
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: '#fff', fontWeight: '600' },
    pageNum: { minWidth: 90, textAlign: 'center', color: '#aaa' },
});
