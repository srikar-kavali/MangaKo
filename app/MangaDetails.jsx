import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dragonLogo from "../assets/dragonLogoTransparent.png";
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
import { getMangaDexDetails, normalizeMangaDex } from '../manga_api/mangadex';
import { searchManga } from '../manga_api/mangaAPI';
import { getWeebcentralManga } from '../manga_api/weebcentral';

const MangaDetails = () => {
    const { mangadexId, weebcentralUrl: wcUrlParam } = useLocalSearchParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [ascending, setAscending] = useState(false);

    const [md, setMd] = useState(null);
    const [weebcentralUrl, setWeebcentralUrl] = useState(wcUrlParam || null);
    const [wcChapters, setWcChapters] = useState([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const mdRaw = await getMangaDexDetails(mangadexId);
                const mdNorm = mdRaw ? normalizeMangaDex(mdRaw) : null;
                if (!cancelled) setMd(mdNorm);
                let wcUrl = wcUrlParam ?? null;
                if (!wcUrl && mdNorm?.title) {
                    const wcResults = await searchManga('weebcentral', mdNorm.title);
                    if (Array.isArray(wcResults) && wcResults.length > 0) {
                        wcUrl = wcResults[0].url;
                    }
                }
                if (!cancelled) setWeebcentralUrl(wcUrl || null);
                if (wcUrl) {
                    const wc = await getWeebcentralManga(wcUrl);
                    if (!cancelled) setWcChapters(wc?.chapters || []);
                } else {
                    if (!cancelled) setWcChapters([]);
                }
            } catch (err) {
                console.error('Failed to fetch details:', err);
                if (!cancelled) {
                    setMd(null);
                    setWcChapters([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [mangadexId, wcUrlParam]);

    const toggleOrder = () => setAscending((v) => !v);

    const sortedChapters = useMemo(() => {
        const arr = Array.isArray(wcChapters) ? [...wcChapters] : [];
        arr.sort((a, b) => {
            const na = parseFloat(a.number || '0');
            const nb = parseFloat(b.number || '0');
            return ascending ? na - nb : nb - na;
        });
        return arr;
    }, [wcChapters, ascending]);

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!md) {
        return (
            <View style={styles.centered}>
                <Text>Something went wrong.</Text>
            </View>
        );
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
                    <Text style={styles.sectionTitle}>Chapters (WeebCentral)</Text>
                    <Pressable onPress={toggleOrder}>
                        <Text style={styles.toggleOrder}>
                            {ascending ? '↑ Oldest First' : '↓ Newest First'}
                        </Text>
                    </Pressable>
                </View>

                {!!sortedChapters.length ? (
                    sortedChapters.map((chapter) => {
                        const chapNum = chapter.number || '–';
                        const chapTitle = chapter.title || '';
                        let updatedText = chapter.updated || '';
                        if (updatedText && /^\d{4}-\d{2}-\d{2}/.test(updatedText)) {
                            updatedText = dayjs(updatedText).fromNow();
                        }
                        return (
                            <Pressable
                                key={chapter.id}
                                onPress={() => router.push(
                                     `/ReadChapter?chapterUrl=${encodeURIComponent(chapter.url)}&mangadexId=${mangadexId}&weebcentralUrl=${encodeURIComponent(weebcentralUrl || '')}`
                                    )}
                                style={styles.chapterRow}
                            >
                                <View style={styles.chapterInfo}>
                                    <Text style={styles.chapterTitle}>
                                        Ch. {chapNum}{chapTitle ? ` - ${chapTitle}` : ''}
                                    </Text>
                                    {!!updatedText && (
                                        <Text style={styles.chapterMeta}>{updatedText}</Text>
                                    )}
                                </View>
                            </Pressable>
                        );
                    })
                ) : (
                    <Text style={{ color: '#666' }}>
                        {weebcentralUrl ? 'No chapters found on WeebCentral.' : 'Could not find this on WeebCentral.'}
                    </Text>
                )}
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
        width: 110,
        height: 160,
        resizeMode: 'cover',
        borderRadius: 8,
        marginRight: 16,
        backgroundColor: '#eee',
    },
    metaInfo: { flex: 1, justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, color: '#1E1E1E' },
    author: { fontSize: 14, color: '#555', marginBottom: 4 },
    artist: { fontSize: 14, color: '#555' },

    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 8,
        color: '#1E1E1E',
    },
    descriptionBox: {
        maxHeight: 200,
        borderWidth: 1,
        borderColor: '#eee',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#fdfdfd',
    },
    description: { fontSize: 15, lineHeight: 22, color: '#444' },

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
    toggleOrder: { color: '#007AFF', fontSize: 14 },

    chapterRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f9f9f9',
        borderRadius: 6,
        marginBottom: 6,
    },
    chapterInfo: { flexDirection: 'column' },
    chapterTitle: { fontSize: 16, color: '#000', fontWeight: '500' },
    chapterMeta: { fontSize: 13, color: '#666', marginTop: 2 },
});
