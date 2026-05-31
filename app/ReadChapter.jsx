import { useState, useEffect, useRef } from "react";
import {
    View, SafeAreaView, ScrollView, Image, StyleSheet,
    Pressable, Text, ActivityIndicator, Dimensions, Platform, Animated,
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
    const headerAnim = useRef(new Animated.Value(1)).current;
    const [headerVis, setHeaderVis] = useState(true);
    const tapTimer = useRef(null);

    const isAsura    = source === 'asura';
    const isMgeko    = source === 'mgeko';
    const isMangapill = source === 'mangapill' || !!mangapillUrl;

    const [selectedCh, setSelectedCh] = useState(chapterId || chapterUrl || null);
    const [pages, setPages] = useState([]);
    const [allChapters, setAllChapters] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [imageSizes, setImageSizes] = useState({});
    const [screenWidth, setScreenWidth] = useState(getW());

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const h = () => setScreenWidth(window.innerWidth);
        window.addEventListener('resize', h);
        return () => window.removeEventListener('resize', h);
    }, []);

    // Save last read bookmark
    useEffect(() => {
        if (!selectedCh) return;
        const k = seriesId || mangapillUrl;
        if (k) updateLastRead(k, selectedCh).catch(() => {});
    }, [selectedCh]);

    // Fetch pages for selected chapter
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
                    // Pages are already filtered (no credits/gifs) by the API
                    urls = (json.pages || []).map(u => proxiedMgeko(u));

                } else if (isMangapill) {
                    const raw = await getChapterPagesMangapill(selectedCh);
                    urls = (Array.isArray(raw) ? raw : []).map(u => proxiedMangapill(u));
                }

                if (!cancelled) {
                    setPages(urls);
                    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 80);
                }
            } catch(e) {
                console.error('ReadChapter pages error:', e);
                if (!cancelled) setPages([]);
            } finally {
                if (!cancelled) setLoadingPages(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedCh]);

    // Fetch full chapter list for prev/next navigation
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
            } catch(e) {
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

    const idx = allChapters.findIndex(ch => ch.id === selectedCh);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < allChapters.length - 1;
    const label = idx >= 0 ? allChapters[idx].title : chapterId ? `Chapter ${chapterId}` : 'Chapter';
    const progress = allChapters.length > 0 ? ((idx + 1) / allChapters.length) * 100 : 0;

    return (
        <SafeAreaView style={S.container}>
            {/* Header — fades on tap */}
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

                {/* Chapter navigation */}
                <View style={S.nav}>
                    <Pressable
                        disabled={!hasPrev}
                        onPress={() => hasPrev && setSelectedCh(allChapters[idx - 1].id)}
                        style={({ pressed }) => [S.navBtn, { opacity: (pressed || !hasPrev) ? 0.35 : 1 }]}
                    >
                        <Ionicons name="chevron-back" size={15} color={C.text1} />
                        <Text style={S.navBtnText}>Previous</Text>
                    </Pressable>

                    <Text style={S.navCounter}>
                        {idx >= 0 ? `${idx + 1} / ${allChapters.length}` : '—'}
                    </Text>

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
        </SafeAreaView>
    );
};

export default ReadChapter;

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg0 },
    header: { backgroundColor: C.bg3, borderBottomWidth: 1, borderBottomColor: C.border, zIndex: 10 },
    headerContent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
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
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginVertical: 20, paddingHorizontal: 14 },
    navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.bg3, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: C.border },
    navBtnNext: { backgroundColor: C.accent, borderColor: C.accent, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    navBtnDone: { backgroundColor: C.greenDim, borderColor: C.greenBorder },
    navBtnText: { color: C.text1, fontWeight: '700', fontSize: 13 },
    navCounter: { width: 64, textAlign: 'center', color: C.text3, fontSize: 12 },
});