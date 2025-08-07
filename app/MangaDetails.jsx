import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getMangaDetails, getChapters } from '../api/mangadex';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import dragonLogo from "../assets/dragonLogoTransparent.png";
dayjs.extend(relativeTime);

const MangaDetails = () => {
    const { mangaId } = useLocalSearchParams();
    const [manga, setManga] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ascending, setAscending] = useState(false);
    const router = useRouter();

    const validChapters = chapters.filter(ch =>
        ch.attributes &&
        ch.attributes.pages > 0 &&
        ch.attributes.translatedLanguage?.includes('en') &&
        ch.attributes.chapter
    );

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const data = await getMangaDetails(mangaId);
                setManga(data);

                const chapterData = await getChapters(mangaId);
                setChapters(chapterData);
            } catch (err) {
                console.error('Failed to fetch details:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [mangaId]);

    const toggleOrder = () => {
        setAscending(!ascending);
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!manga) {
        return (
            <View style={styles.centered}>
                <Text>Something went wrong.</Text>
            </View>
        );
    }

    const { attributes, relationships } = manga;
    const title = attributes.title?.en || 'No title';
    const description = attributes.description?.en || 'No description';
    const coverFileName = relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
    const coverUrl = coverFileName
        ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg`
        : null;
    const author = relationships?.find(r => r.type === 'author')?.attributes?.name || 'Unknown';
    const artist = relationships?.find(r => r.type === 'artist')?.attributes?.name || 'Unknown';

    const sortedChapters = [...validChapters].sort((a, b) => {
        const aNum = parseFloat(a.attributes.chapter) || 0;
        const bNum = parseFloat(b.attributes.chapter) || 0;
        return ascending ? aNum - bNum : bNum - aNum;
    });

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header with logo */}
            <View style={styles.header}>
                <Pressable onPress={() => router.replace('/tabs/home')}>
                    <Image source={dragonLogo} style={styles.logoImage} />
                </Pressable>
            </View>

            {/* Scrollable manga info */}
            <ScrollView contentContainerStyle={styles.container}>
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

                {attributes?.tags?.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Tags</Text>
                        <View style={styles.tagContainer}>
                            {attributes.tags.map((tag, index) => (
                                <View key={index} style={styles.tag}>
                                    <Text style={styles.tagText}>{tag.attributes.name?.en}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {chapters.length > 0 && (
                    <>
                        <View style={styles.chapterHeader}>
                            <Text style={styles.sectionTitle}>Chapters</Text>
                            <Pressable onPress={toggleOrder}>
                                <Text style={styles.toggleOrder}>
                                    {ascending ? '↑ Oldest First' : '↓ Newest First'}
                                </Text>
                            </Pressable>
                        </View>
                        {sortedChapters.map((chapter) => {
                            const chapNum = chapter.attributes.chapter || '–';
                            const chapTitle = chapter.attributes.title || '';
                            const updatedAt = chapter.attributes.updatedAt || chapter.attributes.publishAt;
                            const readableTime = dayjs(updatedAt).fromNow();
                            const group = chapter.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name || 'Unknown';

                            return (
                                <Pressable
                                    key={chapter.id}
                                    onPress={() => router.push(`/ReadChapter?chapterId=${chapter.id}&mangaId=${manga.id}`)}
                                    style={styles.chapterRow}
                                >
                                    <View style={styles.chapterInfo}>
                                        <Text style={styles.chapterTitle}>Ch. {chapNum} {chapTitle && `- ${chapTitle}`}</Text>
                                        <Text style={styles.chapterMeta}>{readableTime} • {group}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default MangaDetails;

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    header: {
        backgroundColor: '#fff',      // White like home
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomColor: '#ddd',
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },

    logoImage: {
        width: 40,   // Bigger than 32
        height: 40,
    },

    container: { padding: 16, paddingBottom: 60 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerSection: { flexDirection: 'row', marginBottom: 16 },
    cover: {
        width: 110,
        height: 160,
        resizeMode: 'cover',
        borderRadius: 8,
        marginRight: 16,
    },
    metaInfo: { flex: 1, justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
    author: { fontSize: 14, color: '#555', marginBottom: 4 },
    artist: { fontSize: 14, color: '#555' },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 8,
    },
    descriptionBox: {
        maxHeight: 200,
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#fdfdfd',
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        color: '#444',
    },
    tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
        backgroundColor: '#e0e0e0',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    tagText: { fontSize: 13, color: '#333' },

    chapterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 8,
    },
    toggleOrder: {
        color: '#007AFF',
        fontSize: 14,
    },
    chapterRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f9f9f9',
        borderRadius: 6,
        marginBottom: 6,
    },
    chapterInfo: {
        flexDirection: 'column',
    },
    chapterTitle: {
        fontSize: 16,
        color: '#000',
        fontWeight: '500',
    },
    chapterMeta: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
});
