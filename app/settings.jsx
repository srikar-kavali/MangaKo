import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser, signOut } from '../auth/cognito';
import { syncLibraryOnce, stopLibrarySync } from '../services/accountSync';

export default function Settings() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  React.useEffect(() => { getCurrentUser().then(user => setEmail(user?.signInDetails?.loginId || user?.username || 'Not signed in')); }, []);
  async function syncNow() {
    setBusy(true); setFeedback('');
    try {
      const result = await syncLibraryOnce();
      setFeedback('Library synchronized. Reopen My List to see any changes from other devices.');
    } catch (e) { setFeedback(e.message || 'Unable to sync your library'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={S.screen}>
    <ScrollView contentContainerStyle={S.content}>
      <Pressable style={S.back} onPress={() => router.replace('/tabs/home')}><Ionicons name="arrow-back" size={18} color="#ddd"/><Text style={S.backText}>Back</Text></Pressable>
      <Text style={S.heading}>Settings</Text>
      <Text style={S.subtitle}>Manage your MangaKo account and reading library.</Text>
      <View style={S.panel}>
        <Text style={S.label}>ACCOUNT</Text>
        <Text style={S.account}>{email || 'Loading account...'}</Text>
      </View>
      <View style={S.panel}>
        <Text style={S.label}>CLOUD LIBRARY</Text>
        <Text style={S.description}>Your saved titles, reading statuses, and chapter progress sync across devices when signed in. You can also sync manually.</Text>
        <Pressable style={[S.button, busy && S.disabled]} onPress={syncNow} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff"/> : <Ionicons name="cloud-upload-outline" size={18} color="#fff"/>}
          <Text style={S.buttonText}>{busy ? 'Syncing...' : 'Sync library now'}</Text>
        </Pressable>
        {!!feedback && <Text style={S.feedback}>{feedback}</Text>}
      </View>
      <Pressable style={S.signOut} onPress={async () => { stopLibrarySync(); await signOut(); router.replace('/login'); }}><Ionicons name="log-out-outline" color="#f87171" size={18}/><Text style={S.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const S = StyleSheet.create({
  screen: { flex:1, backgroundColor:'#0c0c10' },
  content: { width:'100%', maxWidth:760, alignSelf:'center', padding:24, paddingBottom:60, gap:18 },
  back: { flexDirection:'row', gap:8, alignItems:'center', marginBottom:12 },
  backText: { color:'#bdbac9', fontSize:14 },
  heading: { color:'#f1eff8', fontWeight:'800', fontSize:30 },
  subtitle: { color:'#8d899a', fontSize:14, marginBottom:8 },
  panel: { backgroundColor:'#17171f', borderWidth:1, borderColor:'rgba(255,255,255,0.09)', borderRadius:16, padding:22, gap:14 },
  label: { fontSize:11, color:'#9d8fff', fontWeight:'800', letterSpacing:1.2 },
  account: { color:'#f1eff8', fontSize:16, fontWeight:'600' },
  description: { color:'#aaa6b5', fontSize:13, lineHeight:21 },
  button: { backgroundColor:'#7c6af5', padding:14, borderRadius:10, flexDirection:'row', justifyContent:'center', alignItems:'center', gap:10 },
  disabled: { opacity:0.6 },
  buttonText: { color:'#fff', fontWeight:'800', fontSize:14 },
  feedback: { color:'#d8d2f7', fontSize:13, lineHeight:20 },
  signOut: { flexDirection:'row', gap:10, alignItems:'center', padding:14 },
  signOutText: { color:'#f87171', fontWeight:'700' }
});
