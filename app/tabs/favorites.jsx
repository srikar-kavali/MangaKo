import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Image, SafeAreaView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { getFavorites, getLastReadChapterInfo, removeFavorite } from "../searchStorage";
import { Ionicons } from '@expo/vector-icons';

export default function Favorites() {
    const [favorites, setFavorites] = useState([]);
    const [lastReadInfo, setLastReadInfo] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();

    useEffect(() => {
        loadFavorites();
    }, []);

    const loadFavorites = async () => {
        try {
            const favoritesList = await getFavorites();
            setFavorites(favoritesList);

            // Load last read info for each favorite
            const lastReadData = {};
            for (const fav of favoritesList) {
                const lastRead = await getLastReadChapterInfo(fav.url);
                if (lastRead) {
                    lastReadData[fav.url] = lastRead;
                }
            }
            setLastReadInfo(lastReadData);

        } catch (err) {
            console.error("Error loading favorites:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadFavorites();
    };

    const handleRemoveFavorite = async (mangaUrl) => {
        try {
            await removeFavorite(mangaUrl);
            await loadFavorites(); // Refresh the list
        } catch (err) {
            console.error("Error removing favorite:", err);
        }
    };

    const extractChapterNumber = (chapterUrl) => {
        if (!chapterUrl) return 'Unknown';
        const match = chapterUrl.match(/chapter-(\d+(?:\.\d+)?)/);
        return match ? match[1] : 'Unknown';
    };

    const getTimeSince = (timestamp) => {
        if (!timestamp) return '';

        const now = Date.now();
        const diff = now - timestamp;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        return 'Just now';
    };

    const renderFavorite = ({ item }) => {
        const lastRead = lastReadInfo[item.url];
        const chapterNumber = lastRead ? extractChapterNumber(lastRead.chapterUrl) : null;

        return (
            <View style={styles.card}>
                {/* Cover Image */}
                <View style={styles.coverContainer}>
                    {item.coverUrl ? (
                        <Image source={{ uri: item.coverUrl }} style={styles.cover} />
                    ) : (
                        <View style={[styles.cover, styles.noCover]}>
                            <Ionicons name="book" size={24} color="#ccc" />
                        </View>
                    )}
                </View>

                {/* Content */}
                <View style={styles.content}>
                    {/* Title and Remove Button */}
                    <View style={styles.titleRow}>
                        <Pressable
                            onPress={() => {
                                const params = {};
                                if (item.url.includes('mangadex')) {
                                    params.mangadexId = item.url;
                                } else {
                                    params.mangapillUrl = item.url;
                                }
                                router.push({
                                    pathname: "/MangaDetails",
                                    params: params,
                                });
                            }}
                            style={styles.titlePressable}
                        >
                            <Text style={styles.title} numberOfLines={2}>
                                {item.title}
                            </Text>
                        </Pressable>

                        <Pressable
                            onPress={() => handleRemoveFavorite(item.url)}
                            style={styles.removeButton}
                        >
                            <Ionicons name="trash-outline" size={20} color="#ff4444" />
                        </Pressable>
                    </View>

                    {/* Description */}
                    {item.description && (
                        <Text style={styles.description} numberOfLines={2}>
                            {item.description}
                        </Text>
                    )}

                    {/* Last Read Info */}
                    <View style={styles.readingInfo}>
                        {lastRead ? (
                            <>
                                <Pressable
                                    onPress={() =>
                                        router.push({
                                            pathname: "/ReadChapter",
                                            params: {
                                                chapterUrl: lastRead.chapterUrl,
                                                mangapillUrl: item.url.includes('mangapill') ? item.url : ''
                                            },
                                        })
                                    }
                                    style={styles.continueButton}
                                >
                                    <Ionicons name="play-circle" size={16} color="#4CAF50" />
                                    <Text style={styles.continueText}>
                                        Continue Ch. {chapterNumber}
                                    </Text>
                                </Pressable>
                                <Text style={styles.timestamp}>
                                    {getTimeSince(lastRead.timestamp)}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.noChapter}>No chapters read yet</Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text>Loading favorites...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Favorites</Text>
                <Text style={styles.headerCount}>
                    {favorites.length} manga{favorites.length !== 1 ? 's' : ''}
                </Text>
            </View>

            {favorites.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="star-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyTitle}>No favorites yet</Text>
                    <Text style={styles.emptyText}>
                        Add manga to your favorites to see them here
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.url}
                    renderItem={renderFavorite}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                        />
                    }
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#1E1E1E",
    },
    headerCount: {
        fontSize: 14,
        color: "#666",
        marginTop: 4,
    },
    listContainer: {
        padding: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#666',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        marginTop: 8,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    coverContainer: {
        width: 80,
    },
    cover: {
        width: 80,
        height: 120,
        backgroundColor: '#eee',
    },
    noCover: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    titlePressable: {
        flex: 1,
        marginRight: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1E1E1E",
        lineHeight: 22,
    },
    removeButton: {
        padding: 4,
    },
    description: {
        fontSize: 13,
        color: "#666",
        lineHeight: 18,
        marginBottom: 12,
    },
    readingInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 'auto',
    },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f9ff',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    continueText: {
        color: "#4CAF50",
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 4,
    },
    timestamp: {
        fontSize: 11,
        color: "#999",
    },
    noChapter: {
        color: "#999",
        fontSize: 13,
        fontStyle: 'italic',
    },
});