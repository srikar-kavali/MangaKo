import { useState, useEffect } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getChapterPages } from "../manga_api/mangaAPI";
import { getMangapillManga } from "../manga_api/mangapill";

const ReadChapter = () => {
    const { chapterUrl: chapterUrlParam, mangapillUrl, mangadexId } = useLocalSearchParams();

    const router = useRouter();
    const [selectedChapterUrl, setSelectedChapterUrl] = useState(chapterUrlParam || null);
    const [pickerItems, setPickerItems] = useState([]);
    const [pageUrls, setPageUrls] = useState([]);

    // Load pages when selected chapter changes
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!selectedChapterUrl) { setPageUrls([]); return; }
                const urls = await getChapterPages("mangapill", selectedChapterUrl);
                if (!cancelled) setPageUrls(urls || []);
            } catch (error) {
                console.error("Failed to load chapter pages (Mangapill):", error);
                if (!cancelled) setPageUrls([]);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedChapterUrl]);

    // Load chapters list for the Mangapill series
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!mangapillUrl) return;
                const mp = await getMangapillManga(mangapillUrl);
                const items = (mp?.chapters || []).map(ch => ({
                    key: ch.id,
                    label: `Ch ${ch.number || '–'}${ch.title ? ` - ${ch.title}` : ''}`,
                    value: ch.url, // use full URL so we can fetch pages directly
                }));
                if (!cancelled) {
                    setPickerItems(items);
                    // Default to first chapter if none provided in params
                    if (!chapterUrlParam && items.length > 0) {
                        setSelectedChapterUrl(items[0].value);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch Mangapill chapters:", err);
            }
        })();
        return () => { cancelled = true; };
    }, [mangapillUrl, chapterUrlParam]);

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
                    selectedValue={selectedChapterUrl || ""}
                    onValueChange={(value) => setSelectedChapterUrl(value)}
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
