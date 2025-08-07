import { useState, useEffect } from "react";
import { View, SafeAreaView, ScrollView, Image, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import { getChapterPages } from "../api/mangadex";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { Picker } from "@react-native-picker/picker";

const ReadChapter = () => {
    const { chapterId, mangaId } = useLocalSearchParams();
    const [pageUrls, setPageUrls] = useState([]);
    const [chapters, setChapters] = useState([]);
    const [selectedChapter, setSelectedChapter] = useState(chapterId);
    const [offset, setOffset] = useState(0);
    const router = useRouter();

    const limit = 100;

    // Load pages when selectedChapter changes
    useEffect(() => {
        const fetchChapterPages = async () => {
            try {
                const urls = await getChapterPages(selectedChapter);
                setPageUrls(urls);
            } catch (error) {
                console.error("Failed to load chapter pages:", error);
            }
        };

        fetchChapterPages();
    }, [selectedChapter]);

    // Load chapters list for the manga
    useEffect(() => {
        const fetchChapters = async () => {
            try {
                const url = `https://api.mangadex.org/chapter?manga=${mangaId}&translatedLanguage[]=en&includeExternalUrl=0&order[chapter]=asc&limit=${limit}&offset=${offset}`;
                const response = await fetch(url);
                const json = await response.json();
                setChapters(json.data || []);
            } catch (err) {
                console.error("Failed to fetch chapters:", err);
            }
        };

        fetchChapters();
    }, [mangaId, offset]);

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
                    selectedValue={selectedChapter}
                    onValueChange={(value) => setSelectedChapter(value)}
                    style={{ color: 'white', backgroundColor: '#222' }}
                >
                    {chapters.map((chapter) => (
                        <Picker.Item
                            key={chapter.id}
                            label={`Ch ${chapter.attributes.chapter || '–'}`}
                            value={chapter.id}
                        />
                    ))}
                </Picker>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {pageUrls.map((url, index) => (
                    <Image key={index} source={{ uri: url }} style={styles.pageImage} />
                ))}
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
    headerText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    scroll: {
        alignItems: 'center',
        paddingBottom: 20,
    },
    pageImage: {
        width: '100%',
        aspectRatio: 0.7,
        resizeMode: 'contain',
        marginBottom: 10,
    },
});
