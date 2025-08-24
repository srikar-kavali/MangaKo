import React, { useState, useEffect, useMemo } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangapillManga, getChapterPagesMangapill } from "../manga_api/mangapill";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAGE_WIDTH = SCREEN_WIDTH; // full-bleed width

// Build proxied URL so CDN always sees browser-like headers
const withProxy = (baseApi, rawUrl) =>
    `${baseApi.replace(/\/$/, "")}/image?url=${encodeURIComponent(rawUrl)}`;

export default function ReadChapter() {
    const params = useLocalSearchParams();
    const rawChapterUrl = Array.isArray(params.chapterUrl) ? params.chapterUrl[0] : params.chapterUrl || "";
    const mangapillUrl = Array.isArray(params.mangapillUrl) ? params.mangapillUrl[0] : params.mangapillUrl || "";

    const router = useRouter();

    const [selectedChapterUrl, setSelectedChapterUrl] = useState(rawChapterUrl || null);
    const [pageUrls, setPageUrls] = useState([]);
    const [pickerItems, setPickerItems] = useState([]);  // [{key,label,value}]
    const [loadingPages, setLoadingPages] = useState(false);
    const [loadingChapters, setLoadingChapters] = useState(false);

    // expose BASE so we can use the same host for proxying images
    const BASE = process.env.EXPO_PUBLIC_MANGAPILL_API; // e.g. https://manga-XXXXX.vercel.app/api

    // Load pages for the selected chapter
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapterUrl) { setPageUrls([]); return; }
                setLoadingPages(true);
                const urls = await getChapterPagesMangapill(selectedChapterUrl);
                console.log("chapter_pages ->", selectedChapterUrl, urls?.length);

                const finalUrls = Array.isArray(urls)
                    ? urls.map(u => withProxy(BASE, u))
                    : [];

                if (!cancelled) setPageUrls(finalUrls);
            } catch (err) {
                console.error("Failed to load chapter pages (Mangapill):", err);
                if (!cancelled) setPageUrls([]);
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedChapterUrl]);

    // Load chapters list so prev/next works
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!mangapillUrl) return;
                setLoadingChapters(true);
                const mp = await getMangapillManga(mangapillUrl);
                const items = (mp?.chapters || []).map(ch => ({
                    key: ch.url,
                    label: `Ch ${ch.number ?? "–"}${ch.title ? ` - ${ch.title}` : ""}`,
                    value: ch.url,
                }));
                if (!cancelled) {
                    setPickerItems(items);
                    if (!rawChapterUrl && items.length) setSelectedChapterUrl(items[0].value);
                }
            } catch (err) {
                console.error("Failed to fetch Mangapill chapters:", err);
            } finally {
                if (!cancelled) setLoadingChapters(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mangapillUrl, rawChapterUrl]);

    const idx = useMemo(
        () => pickerItems.findIndex(i => i.value === selectedChapterUrl),
        [pickerItems, selectedChapterUrl]
    );
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < pickerItems.length - 1;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.replace("/tabs/home")}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
                <Text style={styles.headerText}>{pickerItems[idx]?.label ?? "Ch."}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {loadingPages ? (
                    <ActivityIndicator size="large" color="#bbb" style={{ marginTop: 20 }} />
                ) : (
                    <>
                        {pageUrls.map((url, i) => (
                            <Image
                                key={`${i}-${url}`}
                                source={{ uri: url }}
                                style={styles.pageImage}
                                resizeMode="contain"
                            />
                        ))}
                        {!pageUrls.length && (
                            <Text style={{ color: "#888", marginTop: 16 }}>No pages found.</Text>
                        )}

                        {/* Prev / Next */}
                        <View style={styles.pagerRow}>
                            <Pressable
                                disabled={!hasPrev}
                                onPress={() => hasPrev && setSelectedChapterUrl(pickerItems[idx - 1].value)}
                                style={[styles.pagerBtn, !hasPrev && styles.pagerBtnDisabled]}
                            >
                                <Text style={styles.pagerText}>Previous</Text>
                            </Pressable>

                            <Text style={styles.pageNum}>
                                {idx >= 0 ? `${idx + 1} / ${pickerItems.length}` : ""}
                            </Text>

                            <Pressable
                                disabled={!hasNext}
                                onPress={() => hasNext && setSelectedChapterUrl(pickerItems[idx + 1].value)}
                                style={[styles.pagerBtn, !hasNext && styles.pagerBtnDisabled]}
                            >
                                <Text style={styles.pagerText}>Next</Text>
                            </Pressable>
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    header: {
        padding: 12,
        backgroundColor: "#111",
        borderBottomWidth: 1,
        borderBottomColor: "#333",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    logoImage: { width: 36, height: 36, resizeMode: "contain" },
    headerText: { color: "#fff", fontSize: 16, fontWeight: "600" },

    scroll: { alignItems: "center", paddingBottom: 24 },
    pageImage: {
        width: PAGE_WIDTH,        // concrete pixels; avoids layout quirks
        height: PAGE_WIDTH * 1.6, // a safe portrait ratio; RN requires numbers
        marginBottom: 10,
        backgroundColor: "#000",
    },

    pagerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginVertical: 10,
        paddingHorizontal: 12,
        width: "100%",
    },
    pagerBtn: {
        flex: 1,
        backgroundColor: "#1e1e1e",
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#333",
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerText: { color: "#fff", fontWeight: "600" },
    pageNum: { minWidth: 90, textAlign: "center", color: "#aaa" },
});
