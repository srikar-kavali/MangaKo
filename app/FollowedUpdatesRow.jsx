import { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFavorites } from './searchStorage';

export default function FollowedUpdatesRow() {
    const [manga, setManga] = useState([]);
    const router = useRouter();

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        const list = await getFavorites();
        // newest followed first
        list.sort((a, b) => b.addedAt - a.addedAt);
        setManga(list);
    };

    if (!manga.length) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Updates</Text>

            <FlatList
                data={manga}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.url}
                contentContainerStyle={{ paddingHorizontal: 12 }}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.85}
                        onPress={() => {
                            router.push({
                                pathname: '/MangaDetails',
                                params: {
                                    mangapillUrl: item.url,
                                },
                            });
                        }}
                    >
                        <Image
                            source={{ uri: item.coverUrl }}
                            style={styles.cover}
                        />

                        {/* Placeholder until latest chapter is wired */}
                        <View style={styles.chapterBadge}>
                            <Text style={styles.chapterText}>
                                Followed
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 12,
    },
    header: {
        fontSize: 18,
        fontWeight: '700',
        marginLeft: 12,
        marginBottom: 8,
    },
    card: {
        marginRight: 12,
        width: 120,
    },
    cover: {
        width: 120,
        height: 170,
        borderRadius: 10,
    },
    chapterBadge: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderRadius: 6,
        paddingVertical: 4,
    },
    chapterText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
});
