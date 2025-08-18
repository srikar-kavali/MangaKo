import { useState, useEffect, useMemo } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import { getChapterPages } from "../api/mangaAPI";
import { getWeebcentralManga } from "../api/weebcentral";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { Picker } from "@react-native-picker/picker";

const ReadChapter = () => {
    const { chapterUrl: chapterUrlParam, weebcentralUrl, mangadexId, chapterId: mdChapterId } = useLocalSearchParams();
    const router = useRouter();
    const [selectedChapter, setSelectedChapter] = useState(chapterUrlParam || null);
    const [pickerItems, setPickerItems] = useState([]);
    const [pageUrls, setPageUrls] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapter) {
                    setPageUrls([]);
                    return;
                }
                const urls = await getChapterPages("weebcentral", selectedChapter);
                if (!cancelled) setPageUrls(urls || []);
            } catch (error) {
                console.error("Failed to load chapter pages (WC):", error);
                if (!cancelled) setPageUrls([]);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedChapter]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (weebcentralUrl) {
                    const wc = await getWeebcentralManga(weebcentralUrl);
                    const items = (wc?.chapters || []).map(ch => ({
                        key: ch.id,
                        label: `Ch ${ch.number || '–'}${ch.title ? ` - ${ch.title}` : ''}`,
                        value: ch.url,
                    }));
                    if (!cancelled) {
                        setPickerItems(items);
                        if (!chapterUrlParam && items.length > 0) {
                            setSelectedChapter(items[0].value);
                        }
                    }
                    return;
                }

                if (mangadexId) {
                    const url = `https://api.mangadex.org/chapter?manga=${mangadexId}&translatedLanguage[]=en&includeExternalUrl=0&order[chapter]=asc&limit=100&offset=0`;
                    const resp = await fetch(url);
                    const json = await resp.json();
                    const chapters = json?.data || [];
                    const items = chapters.map(ch => ({
                        key: ch.id,
                        label: `Ch ${ch.attributes?.chapter || '–'}`,
                        value: ch.id,
                    }));
                    if (!cancelled) {
                        setPickerItems(items);
                        if (!chapterUrlParam && items.length > 0 && mdChapterId) return;
                    }
                }
            } catch (err) {
                console.error("Failed to load chapter list:", err);
            }
        })();
        return () => { cancelled = true; };
    }, [weebcentralUrl, mangadexId, chapterUrlParam, mdChapterId]);

    const handlePickerChange = (value) => {
        if (typeof value === "string" && value.startsWith("http")) {
            setSelectedChapter(value); // WC URL
        } else {
            console.warn("Selected a MangaDex chapter id; pages are WC-only. Provide weebcentralUrl for full picker support.");
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Pressable onPress={() => router.replace('/tabs/home')}>
                        <Image source={dragonLogo} style={styles.logoImage} />
                    </Pressable>
                    <Text style={styles.headerText}>Read Chapter</Text>
                </View>

                <Picker
                    selectedValue={selectedChapter || mdChapterId || ""}
                    onValueChange={handlePickerChange}
                    style={{ color: 'white', backgroundColor: '#222', minWidth: 160 }}
                >
                    {pickerItems.map((item) => (
                        <Picker.Item key={item.key} label={item.label} value={item.value} />
                    ))}
                </Picker>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {pageUrls.map((url, index) => (
                    <Image key={index} source={{ uri: url }} style={styles.pageImage} />
                ))}
                {!pageUrls.length && (
                    <Text style={{ color: "#888", marginTop: 16 }}>No pages found.</Text>
                )}
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
    },
    logoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    logoImage: { width: 50, height: 50, resizeMode: 'contain', marginRight: 8 },
    headerText: { color: '#fff', fontSize: 18, fontWeight: '600' },
    scroll: { alignItems: 'center', paddingBottom: 20 },
    pageImage: { width: '100%', aspectRatio: 0.7, resizeMode: 'contain', marginBottom: 10 },
});
