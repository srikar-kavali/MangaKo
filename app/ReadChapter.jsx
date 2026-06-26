import { useState, useEffect, useRef } from "react";
import {
    View, SafeAreaView, ScrollView, Image, StyleSheet,
    Pressable, Text, ActivityIndicator, Dimensions, Platform,
    Animated, Modal, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import dragonLogo from "../assets/dragonLogoTransparent.png";
import { getMangapillManga, getChapterPagesMangapill, proxied as proxiedMangapill } from "../manga_api/mangapill";
import { proxied as proxiedMgeko } from "../manga_api/mgeko";
import { updateLastRead } from "./searchStorage";
import { Ionicons } from '@expo/vector-icons';

const C = {
    bg0:'#000000', bg1:'#07070a', bg2:'#0c0c10', bg3:'#111118',
    border:'rgba(255,255,255,0.08)', text1:'#eeedf0', text2:'#7c7b88', text3:'#38373f',
    accent:'#7c6af5', green:'#34d399', greenDim:'rgba(52,211,153,0.10)', greenBorder:'rgba(52,211,153,0.25)',
};

const BACKEND = process.env.EXPO_PUBLIC_CHAPTERS_API;
const getW = () => Platform.OS === 'web' ? window.innerWidth : Dimensions.get('window').width;

const ReadChapter = () => {
    const params = useLocalSearchParams();
    const { seriesId, chapterId, chapterUrl, mangapillUrl, source } = params;
    const router = useRouter();
    const scrollRef = useRef(null);
    const pickerListRef = useRef(null);
    const headerAnim = useRef(new Animated.Value(1)).current;
    const [headerVis, setHeaderVis] = useState(true);
    const tapTimer = useRef(null);

    const isAsura     = source === 'asura';
    const isMgeko     = source === 'mgeko';
    const isMangapill = source === 'mangapill' || !!mangapillUrl;

    const [selectedCh, setSelectedCh] = useState(chapterId || chapterUrl || null);
    const [pages, setPages] = useState([]);
    const [allChapters, setAllChapters] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [imageSizes, setImageSizes] = useState({});
    const [screenWidth, setScreenWidth] = useState(getW());
    const [pickerVisible, setPickerVisible] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const h = () => setScreenWidth(window.innerWidth);
        window.addEventListener('resize', h);
        return () => window.removeEventListener('resize', h);
    }, []);

    // Save progress whenever selected chapter changes
    // updateLastRead signature: (mangaUrl, chapterUrl) — no timestamp param
    useEffect(() => {
        if (!selectedCh) return;
        let trackingKey = seriesId || mangapillUrl;
        if (!trackingKey) return;

        if (trackingKey.includes('mangapill.com')) {
            const parts = trackingKey.split('/').filter(Boolean);
            const index = parts.indexOf('manga');
            if (index !== -1 && parts[index + 1]) {
                trackingKey = parts.slice(index + 1).join('__');
            } else {
                trackingKey = parts.pop() || trackingKey;
            }
        }

        updateLastRead(trackingKey, selectedCh).catch(err => {
            console.error('Failed updating read progress:', err);
        });
    }, [selectedCh, seriesId, mangapillUrl]);

    // Fetch pages for the current chapter
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!selectedCh) { setPages([]); return; }
            setLoadingPages(true);
            scrollRef.current?.scrollTo({ y: 0, animated: false });
            try {
                let urls = [];
                if (isAsura && seriesId) {
                    const res = await fetch(`${BACKEND}/api/asura-chapters?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(selectedCh)}`);
                    const json = await res.json();
                    urls = (json.pages || []).map(u => `${BACKEND}/api/image_proxy?url=${encodeURIComponent(u)}`);
                } else if (isMgeko && seriesId) {
                    const res = await fetch(`${BACKEND}/api/mgeko-chapters?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(selectedCh)}`);
                    const json = await res.json();
                    urls = (json.pages || []).map(u => proxiedMgeko(u));
                } else if (isMangapill) {
                    const raw = await getChapterPagesMangapill(selectedCh);
                    urls = (Array.isArray(raw) ? raw : []).map(u => proxiedMangapill(u));
                }
                if (!cancelled) {
                    setPages(urls);
                    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 80);
                }
            } catch (e) {
                console.error('ReadChapter pages error:', e);
                if (!cancelled) setPages([]);
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedCh]);

    // Fetch full chapter list for navigation + picker
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!seriesId && !mangapillUrl) return;
            try {
                let chapters = [];
                if (isAsura && seriesId) {
                    const res = await fetch(`${BACKEND}/api/asura-chapters?seriesId=${encodeURIComponent(seriesId)}`);
                    const json = await res.json();
                    chapters = (json.chapters || []).map(ch => ({
                        id: ch.id,
                        title: `Chapter ${ch.id}`,
                        number: parseFloat(ch.id) || 0,
                    }));
                } else if (isMgeko && seriesId) {
                    const res = await fetch(`${BACKEND}/api/mgeko-chapters?seriesId=${encodeURIComponent(seriesId)}`);
                    const json = await res.json();
                    chapters = (json.chapters || []).map(ch => ({
                        id: ch.id,
                        title: `Chapter ${ch.id}`,
                        number: parseFloat(ch.id) || 0,
                    }));
                } else if (isMangapill && mangapillUrl) {
                    const data = await getMangapillManga(mangapillUrl);
                    chapters = (data.chapters || []).map(ch => {
                        const slug = String(ch.url).split('/').filter(Boolean).pop() || '';
                        const m = slug.match(/(\d+(\.\d+)?)/);
                        return { id: ch.url, title: `Ch. ${m ? m[1] : '–'}`, number: m ? parseFloat(m[1]) : 0 };
                    });
                }
                chapters.sort((a, b) => a.number - b.number);
                if (!cancelled) {
                    setAllChapters(chapters);
                    if (!selectedCh && chapters.length) setSelectedCh(chapters[0].id);
                }
            } catch (e) {
                console.error('ReadChapter chapters list error:', e);
            }
        })();
        return () => { cancelled = true; };
    }, [seriesId, mangapillUrl, source]);

    const toggleHeader = () => {
        clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => {
            const to = headerVis ? 0 : 1;
            Animated.timing(headerAnim, { toValue: to, duration: 200, useNativeDriver: true }).start();
            setHeaderVis(!headerVis);
        }, 80);
    };

    // Fix: compute current index at call time, not from stale closure
    const openPicker = () => {
        const currentIdx = allChapters.findIndex(ch => ch.id === selectedCh);
        setPickerVisible(true);
        if (pickerListRef.current && currentIdx >= 0) {
            setTimeout(() => {
                pickerListRef.current?.scrollToIndex({
                    index: currentIdx,
                    animated: false,
                    viewPosition: 0.5,
                });
            }, 150);
        }
    };

    const idx = allChapters.findIndex(ch => ch.id === selectedCh);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < allChapters.length - 1;
    const label = idx >= 0 ? allChapters[idx].title : chapterId ? `Chapter ${chapterId}` : 'Chapter';
    const progress = allChapters.length > 0 ? ((idx + 1) / allChapters.length) * 100 : 0;

    return (
        <SafeAreaView style={S.container}>
            {/* HEADER — logo + title + progress bar, no top nav arrows */}
            <Animated.View style={[S.header, {
                opacity: headerAnim,
                transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
            }]}>
                <View style={S.headerContent}>
                    <Pressable onPress={() => router.replace('/tabs/home')} hitSlop={10}>
                        <Image source={dragonLogo} style={S.logoImg} />
                    </Pressable>
                    <View style={S.headerInfo}>
                        <Text style={S.headerTitle} numberOfLines={1}>{label}</Text>
                        {allChapters.length > 0 && (
                            <Text style={S.headerSub}>{idx + 1} / {allChapters.length}</Text>
                        )}
                    </View>
                </View>
                <View style={S.progWrap}>
                    <View style={[S.progFill, { width: `${progress}%` }]} />
                </View>
            </Animated.View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={S.scrollContent}
                showsVerticalScrollIndicator={false}
                onTouchEnd={toggleHeader}
            >
                {loadingPages && (
                    <View style={S.loadWrap}>
                        <ActivityIndicator size="large" color={C.accent} />
                        <Text style={S.loadText}>Loading pages...</Text>
                    </View>
                )}

                {!loadingPages && pages.map((url, i) => (
                    <View key={i} style={S.pageWrap}>
                        {Platform.OS === 'web' ? (
                            <img
                                src={url}
                                style={{ width: '100%', height: 'auto', display: 'block', backgroundColor: '#000' }}
                                loading="lazy"
                            />
                        ) : (
                            <Image
                                source={{ uri: url }}
                                style={{
                                    width: '100%',
                                    height: imageSizes[i] ? screenWidth / imageSizes[i] : screenWidth * 1.4,
                                    backgroundColor: '#000',
                                }}
                                onLoad={(e) => {
                                    const src = e.nativeEvent?.source;
                                    if (src?.width && src?.height) setImageSizes(p => ({ ...p, [i]: src.width / src.height }));
                                }}
                                resizeMode="contain"
                            />
                        )}
                    </View>
                ))}

                {!loadingPages && pages.length === 0 && (
                    <View style={S.emptyWrap}>
                        <Ionicons name="image-outline" size={40} color={C.text3} />
                        <Text style={S.emptyText}>No pages found.</Text>
                    </View>
                )}

                {/* BOTTOM NAV — Prev | tappable counter | Next/Done */}
                <View style={S.nav}>
                    <Pressable
                        disabled={!hasPrev}
                        onPress={() => hasPrev && setSelectedCh(allChapters[idx - 1].id)}
                        style={({ pressed }) => [S.navBtn, { opacity: (pressed || !hasPrev) ? 0.35 : 1 }]}
                    >
                        <Ionicons name="chevron-back" size={15} color={C.text1} />
                        <Text style={S.navBtnText}>Previous</Text>
                    </Pressable>

                    {/* Tap to open chapter picker */}
                    <Pressable style={S.navCounter} onPress={openPicker}>
                        <Text style={S.navCounterText}>
                            {idx >= 0 ? `${idx + 1} / ${allChapters.length}` : '—'}
                        </Text>
                        <Ionicons name="chevron-expand" size={11} color={C.text3} style={{ marginTop: 2 }} />
                    </Pressable>

                    {hasNext ? (
                        <Pressable
                            onPress={() => setSelectedCh(allChapters[idx + 1].id)}
                            style={({ pressed }) => [S.navBtn, S.navBtnNext, { opacity: pressed ? 0.85 : 1 }]}
                        >
                            <Text style={[S.navBtnText, { color: '#fff' }]}>Next</Text>
                            <Ionicons name="chevron-forward" size={15} color="#fff" />
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => router.replace('/tabs/home')}
                            style={({ pressed }) => [S.navBtn, S.navBtnDone, { opacity: pressed ? 0.85 : 1 }]}
                        >
                            <Ionicons name="home-outline" size={14} color={C.green} />
                            <Text style={[S.navBtnText, { color: C.green }]}>Home</Text>
                        </Pressable>
                    )}
                </View>
            </ScrollView>

            {/* CHAPTER PICKER MODAL — slides up from bottom */}
            <Modal
                transparent
                visible={pickerVisible}
                animationType="slide"
                onRequestClose={() => setPickerVisible(false)}
            >
                <Pressable style={S.modalOverlay} onPress={() => setPickerVisible(false)}>
                    <View style={S.pickerSheet}>
                        {/* Handle bar */}
                        <View style={S.pickerHandle} />

                        <View style={S.pickerHeader}>
                            <Text style={S.pickerHeaderTitle}>Select Chapter</Text>
                            <Pressable onPress={() => setPickerVisible(false)} hitSlop={10}>
                                <Ionicons name="close-circle" size={22} color={C.text2} />
                            </Pressable>
                        </View>

                        <FlatList
                            ref={pickerListRef}
                            data={allChapters}
                            keyExtractor={item => String(item.id)}
                            getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
                            onScrollToIndexFailed={({ index }) => {
                                // Retry after layout settles
                                setTimeout(() => {
                                    pickerListRef.current?.scrollToIndex({
                                        index,
                                        animated: false,
                                        viewPosition: 0.5,
                                    });
                                }, 200);
                            }}
                            renderItem={({ item }) => {
                                const isActive = item.id === selectedCh;
                                return (
                                    <Pressable
                                        style={({ pressed }) => [
                                            S.pickerItem,
                                            isActive && S.pickerItemActive,
                                            pressed && { opacity: 0.7 },
                                        ]}
                                        onPress={() => {
                                            setSelectedCh(item.id);
                                            setPickerVisible(false);
                                        }}
                                    >
                                        <Text style={[S.pickerItemText, isActive && S.pickerItemTextActive]}>
                                            {item.title}
                                        </Text>
                                        {isActive && (
                                            <Ionicons name="checkmark-sharp" size={16} color={C.accent} />
                                        )}
                                    </Pressable>
                                );
                            }}
                        />
                    </View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
};

export default ReadChapter;

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg0 },

    header: {
        backgroundColor: C.bg3, borderBottomWidth: 1, borderBottomColor: C.border, zIndex: 10,
    },
    headerContent: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8,
    },
    logoImg: { width: 30, height: 30, resizeMode: 'contain' },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 14, fontWeight: '700', color: C.text1 },
    headerSub: { fontSize: 11, color: C.text3, marginTop: 1 },
    progWrap: { height: 2, backgroundColor: C.bg0 },
    progFill: { height: 2, backgroundColor: C.accent },

    scrollContent: { backgroundColor: C.bg0, paddingBottom: 24 },
    pageWrap: { width: '100%', marginBottom: 1 },
    loadWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
    loadText: { color: C.text3, fontSize: 13 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 10 },
    emptyText: { color: C.text3, fontSize: 14 },

    nav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginVertical: 20, paddingHorizontal: 14,
    },
    navBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 5, backgroundColor: C.bg3, paddingVertical: 13, borderRadius: 10,
        borderWidth: 1, borderColor: C.border,
    },
    navBtnNext: {
        backgroundColor: C.accent, borderColor: C.accent,
        shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    navBtnDone: { backgroundColor: C.greenDim, borderColor: C.greenBorder },
    navBtnText: { color: C.text1, fontWeight: '700', fontSize: 13 },

    // Tappable counter — replaced plain Text with Pressable
    navCounter: {
        width: 72, alignItems: 'center', justifyContent: 'center', gap: 2,
        paddingVertical: 6,
    },
    navCounterText: { color: C.text3, fontSize: 12, fontWeight: '600', textAlign: 'center' },

    // Bottom sheet modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    pickerSheet: {
        backgroundColor: C.bg3, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderWidth: 1, borderBottomWidth: 0, borderColor: C.border,
        maxHeight: '70%', overflow: 'hidden',
    },
    pickerHandle: {
        width: 36, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignSelf: 'center', marginTop: 10, marginBottom: 4,
    },
    pickerHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: C.border,
    },
    pickerHeaderTitle: { color: C.text1, fontSize: 15, fontWeight: '700' },
    pickerItem: {
        height: 48, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    pickerItemActive: { backgroundColor: 'rgba(124,106,245,0.10)' },
    pickerItemText: { color: C.text2, fontSize: 14, fontWeight: '500' },
    pickerItemTextActive: { color: C.accent, fontWeight: '700' },
});