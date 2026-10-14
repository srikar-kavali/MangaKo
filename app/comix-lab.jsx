import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getComixChapters, getComixDetails, isComixEnabled, searchComix } from '../services/comix';

const C = { bg: '#0c0c10', panel: '#191920', line: '#2b2b37', text: '#f5f5f8', muted: '#a5a5b8', accent: '#b39aff' };
const PRESETS = ['Solo Leveling', 'One Piece', "Omniscient Reader's Viewpoint"];
const pretty = value => JSON.stringify(value, null, 2);

export default function ComixLab() {
  const router = useRouter();
  const [query, setQuery] = useState('Solo Leveling');
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [details, setDetails] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [chapterPage, setChapterPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Search to check the live Comix API.');

  // This route is accessible only by direct URL and is inert unless explicitly enabled.
  if (!isComixEnabled()) {
    return <View style={S.center}><Text style={S.title}>Comix Lab is disabled</Text>
      <Text style={S.note}>Set EXPO_PUBLIC_ENABLE_COMIX=true in .env, then restart Expo.</Text>
      <Pressable style={S.button} onPress={() => router.back()}><Text style={S.buttonLabel}>Go back</Text></Pressable>
    </View>;
  }

  async function runSearch(value = query) {
    if (!value.trim() || busy) return;
    setBusy('search'); setError(''); setMessage('Checking the live Comix search endpoint…');
    setChosen(null); setDetails(null); setChapters(null);
    try {
      const data = await searchComix(value, { page: 1, limit: 12 });
      setResults(data.results);
      setPagination(data.pagination);
      setMessage(data.results.length + ' title(s) returned. Select a result to inspect.');
    } catch (e) {
      setResults([]); setPagination(null); setMessage('');
      setError('Search failed: ' + (e?.message || String(e)));
    } finally { setBusy(''); }
  }

  async function inspect(item) {
    if (busy) return;
    setChosen(item); setDetails(null); setChapters(null); setChapterPage(1);
    setBusy('details'); setError('');
    try {
      const data = await getComixDetails(item.id);
      setDetails(data);
    } catch (e) {
      setError('Details failed: ' + (e?.message || String(e)));
    } finally { setBusy(''); }
  }

  async function loadChapters(page = 1) {
    if (!chosen || busy) return;
    setBusy('chapters'); setError('');
    try {
      const data = await getComixChapters(chosen.id, { page, limit: 30 });
      setChapters(data); setChapterPage(page);
    } catch (e) {
      setError('Chapters failed: ' + (e?.message || String(e)));
    } finally { setBusy(''); }
  }

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}><Text style={S.back}>‹ Back to MangaKo</Text></Pressable>
      <Text style={S.eyebrow}>EXPERIMENTAL · LIVE API CHECK</Text>
      <Text style={S.title}>Comix Lab</Text>
      <Text style={S.note}>Test search, metadata, and chapter listings. This screen never opens the reader or modifies your library.</Text>
      <View style={S.row}>
        <TextInput style={S.input} value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()} placeholder="Search manga or manhwa" placeholderTextColor={C.muted} />
        <Pressable style={S.button} disabled={!!busy} onPress={() => runSearch()}><Text style={S.buttonLabel}>Search</Text></Pressable>
      </View>
      <View style={S.rowWrap}>
        {PRESETS.map(term => <Pressable key={term} style={S.chip} onPress={() => { setQuery(term); runSearch(term); }} disabled={!!busy}><Text style={S.chipText}>{term}</Text></Pressable>)}
      </View>
      {!!busy && <View style={S.row}><ActivityIndicator color={C.accent} /><Text style={S.note}>Loading {busy}…</Text></View>}
      {!!error && <Text selectable style={S.error}>{error}</Text>}
      {!!message && <Text style={S.note}>{message}</Text>}
      {!!pagination && <Text style={S.small}>Pagination: {pretty(pagination)}</Text>}
      <View style={S.results}>
        {results.map(item => <Pressable key={item.id} style={[S.result, chosen?.id === item.id && S.selected]} onPress={() => inspect(item)} disabled={!!busy}>
          {item.cover ? <Image source={{ uri: item.cover }} style={S.cover} /> : <View style={S.cover} />}
          <View style={S.resultText}><Text style={S.resultTitle}>{item.title}</Text><Text style={S.small}>{item.type || 'Unknown type'} · {item.id}</Text></View>
        </Pressable>)}
      </View>
      {!!chosen && <View style={S.panel}>
        <Text style={S.heading}>Selected: {chosen.title}</Text>
        <Text style={S.small}>Source ID: {chosen.id}</Text>
        {!!details && <><Text style={S.label}>Title metadata (raw response)</Text><Text selectable style={S.code}>{pretty(details)}</Text></>}
        <Pressable style={S.button} disabled={!!busy} onPress={() => loadChapters(1)}><Text style={S.buttonLabel}>Inspect chapter list</Text></Pressable>
        {!!chapters && <>
          <Text style={S.label}>Chapter response · page {chapterPage}</Text>
          <Text selectable style={S.code}>{pretty(chapters)}</Text>
          <View style={S.row}>
            <Pressable style={S.chip} disabled={!!busy || chapterPage === 1} onPress={() => loadChapters(chapterPage - 1)}><Text style={S.chipText}>Previous</Text></Pressable>
            <Pressable style={S.chip} disabled={!!busy} onPress={() => loadChapters(chapterPage + 1)}><Text style={S.chipText}>Next page</Text></Pressable>
          </View>
        </>}
      </View>}
      <Text style={S.note}>Unofficial Comix integration. Do not enable in production without verifying permission and reliability.</Text>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, container: { padding: 20, maxWidth: 940, width: '100%', alignSelf: 'center', gap: 14, paddingBottom: 80 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  title: { color: C.text, fontSize: 30, fontWeight: '800' },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  note: { color: C.muted, fontSize: 13, lineHeight: 21 },
  back: { color: C.accent, fontSize: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { color: C.text, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 14, minWidth: 0, flex: 1 },
  button: { backgroundColor: C.accent, paddingHorizontal: 17, paddingVertical: 13, borderRadius: 11, alignSelf: 'flex-start' },
  buttonLabel: { color: '#0d0918', fontWeight: '800', fontSize: 13 },
  chip: { borderColor: C.line, borderWidth: 1, backgroundColor: C.panel, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  chipText: { color: C.text, fontSize: 12 },
  error: { color: '#ff9292', backgroundColor: '#3d2028', padding: 14, borderRadius: 10 },
  results: { gap: 9 }, result: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, padding: 10, gap: 12, borderRadius: 12 },
  selected: { borderColor: C.accent }, cover: { width: 52, height: 72, backgroundColor: C.line, borderRadius: 6 },
  resultText: { flex: 1, justifyContent: 'center', gap: 5 }, resultTitle: { color: C.text, fontWeight: '700', fontSize: 15 },
  small: { color: C.muted, fontSize: 11, lineHeight: 16 },
  panel: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  heading: { color: C.text, fontSize: 18, fontWeight: '700' }, label: { color: C.accent, fontSize: 13, fontWeight: '700' },
  code: { color: C.text, fontSize: 11, lineHeight: 16, fontFamily: 'monospace', backgroundColor: C.bg, borderRadius: 8, padding: 12 },
});
