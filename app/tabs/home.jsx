import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Image, Pressable, TextInput, FlatList, } from 'react-native';
import dragonLogo from '../../assets/dragonLogoTransparent.png';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../auth/cognito';
import { getRecentSearches, saveRecentSearches } from '../searchStorage';
import { searchMangaDex } from '../../api/mangadex';

const Home = () => {
    const [searchActive, setSearchActive] = useState(false);
    const [query, setQuery] = useState('');
    const [recentSearches, setRecentSearches] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const loadSearches = async () => {
            const saved = await getRecentSearches();
            setRecentSearches(saved);
        };
        loadSearches();
    }, []);

    useEffect(() => {
        const delayDebounce = setTimeout(async () => {
            const currentQuery = query.trim();
            if (!currentQuery) {
                setSearchResults([]);
                return;
            }

            try {
                const results = await searchMangaDex(currentQuery);
                setSearchResults(results);
            } catch (error) {
                console.log('Live search failed', error);
                setSearchResults([]);
            }
        }, 400);

        return () => clearTimeout(delayDebounce);
    }, [query]);

    const handleAddSearch = async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const updated = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 10);
        setRecentSearches(updated);
        await saveRecentSearches(updated);
    };

    const removeSearch = async (text) => {
        const updated = recentSearches.filter((item) => item !== text);
        setRecentSearches(updated);
        await saveRecentSearches(updated);
    };

    return (
        <SafeAreaView style={styles.screen}>
            <View style={styles.header}>
                <View style={styles.logoLeft}>
                    <Pressable style={styles.logo} onPress={() => router.replace('/tabs/home')}>
                        <Image source={dragonLogo} style={styles.logoImage} />
                    </Pressable>
                    <Text style={styles.logoText}>Mangako</Text>
                </View>
                <Pressable onPress={() => {
                    setSearchActive(true);
                    setDropdownVisible(false);
                }}>
                    <Ionicons name='search-circle-outline' style={styles.icon} size={40} />
                </Pressable>
                <Pressable onPress={() => setDropdownVisible(!dropdownVisible)}>
                    <Ionicons name="person-circle-outline" size={40} style={styles.icon} />
                </Pressable>
            </View>

            {dropdownVisible && (
                <>
                    <View style={styles.triangle} />
                    <View style={styles.dropdown}>
                        <Pressable onPress={() => {
                            setDropdownVisible(false);
                            router.push('/settings');
                        }}>
                            <Text style={styles.dropdownItem}>Settings</Text>
                        </Pressable>
                        <Pressable onPress={async () => {
                            setDropdownVisible(false);
                            await signOut();
                            router.replace('/login');
                        }}>
                            <Text style={styles.dropdownItem}>Sign Out</Text>
                        </Pressable>
                    </View>
                </>
            )}

            <View style={styles.borderLine} />

            {searchActive && (
                <View style={styles.searchOverlay}>
                    <SafeAreaView style={styles.searchContainer}>
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#aaa" style={styles.searchIcon} />
                            <TextInput
                                placeholder="Search"
                                placeholderTextColor="#aaa"
                                style={styles.input}
                                value={query}
                                onChangeText={setQuery}
                                autoFocus
                                onSubmitEditing={async () => {
                                    const currentQuery = query.trim();
                                    if (!currentQuery) return;
                                    handleAddSearch(currentQuery);

                                    try {
                                        const results = await searchMangaDex(currentQuery);
                                        setSearchResults(results);
                                    } catch (error) {
                                        console.log('Search failed', error);
                                        setSearchResults([]);
                                    }

                                    setQuery('');
                                }}
                            />
                            <Pressable onPress={() => setSearchActive(false)}>
                                <Text style={styles.cancel}>Cancel</Text>
                            </Pressable>
                        </View>

                        <FlatList
                            data={recentSearches}
                            keyExtractor={(item, index) => index.toString()}
                            renderItem={({ item }) => (
                                <View style={styles.historyRow}>
                                    <View style={styles.historyLeft}>
                                        <Ionicons name="time-outline" size={20} color="#aaa" />
                                        <Text style={styles.historyText}>{item}</Text>
                                    </View>
                                    <Pressable onPress={() => removeSearch(item)}>
                                        <Ionicons name="close-outline" size={18} color="#aaa" />
                                    </Pressable>
                                </View>
                            )}
                        />

                        {searchResults.length > 0 && (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => {
                                    const title = item.attributes?.title?.en || 'No title';
                                    const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
                                    const coverFile = coverRel?.attributes?.fileName;
                                    const coverUrl = coverFile
                                        ? `https://uploads.mangadex.org/covers/${item.id}/${coverFile}.256.jpg`
                                        : null;

                                    return (
                                        <Pressable
                                            onPress={() => {
                                                    setSearchActive(false);
                                                    router.push(`/MangaDetails?mangadexId=${item.id}`);
                                                }}
                                            style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                                        >
                                            {coverUrl && (
                                                <Image
                                                    source={{ uri: coverUrl }}
                                                    style={{ width: 50, height: 75, marginRight: 12, borderRadius: 4 }}
                                                />
                                            )}
                                            <Text style={{ fontSize: 16, color: '#000', flexShrink: 1 }}>{title}</Text>
                                        </Pressable>
                                    );
                                }}
                            />
                        )}
                    </SafeAreaView>
                </View>
            )}
        </SafeAreaView>
    );
};

export default Home;

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        zIndex: 1,
    },
    logoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoImage: {
        width: 50,
        height: 50,
        resizeMode: 'contain',
        marginRight: 8,
    },
    logoText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1E1E1E',
    },
    icon: {
        color: '#333',
    },
    triangle: {
        position: 'absolute',
        top: 115,
        right: 28,
        width: 12,
        height: 12,
        backgroundColor: '#fff',
        transform: [{ rotate: '45deg' }],
        borderTopColor: '#ccc',
        borderLeftColor: '#ccc',
        borderTopWidth: 1,
        borderLeftWidth: 1,
        zIndex: 101,
    },
    dropdown: {
        position: 'absolute',
        top: 120,
        right: 16,
        backgroundColor: '#fff',
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 6,
        paddingVertical: 8,
        zIndex: 99,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    dropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#333',
    },
    borderLine: {
        height: 1,
        backgroundColor: '#ccc',
        width: '100%',
    },
    searchOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        zIndex: 999,
        elevation: 10,
    },
    searchContainer: {
        flex: 1,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 12,
        backgroundColor: '#f1f1f1',
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 44,
    },
    searchIcon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        color: '#000',
    },
    cancel: {
        color: '#007AFF',
        marginLeft: 10,
    },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomColor: '#eee',
        borderBottomWidth: 1,
    },
    historyLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    historyText: {
        color: '#333',
        fontSize: 16,
        marginLeft: 8,
    },
});
