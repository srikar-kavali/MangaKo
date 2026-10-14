import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAuthSession } from 'aws-amplify/auth';

const API = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');
const KEYS = ['favorites','lastReadChapters','hiddenContinueReading','completed_manga'];
const PREFIXES = ['status:', 'lastviewed:'];
let busy = false;

async function request(method, payload) {
  if (!API) throw new Error('Sync API URL is not configured');
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in before syncing');
  const res = await fetch(`${API}/api/library-sync`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Sync error ${res.status}`);
  return json;
}

async function getLocal() {
  const allKeys = await AsyncStorage.getAllKeys();
  const keys = [...KEYS, ...allKeys.filter(k => PREFIXES.some(p => k.startsWith(p)))];
  const values = await AsyncStorage.multiGet([...new Set(keys)]);
  return Object.fromEntries(values.filter(([,v]) => v != null));
}

async function restore(snapshot) {
  const entries = Object.entries(snapshot || {}).filter(([key,value]) =>
    (KEYS.includes(key) || PREFIXES.some(p => key.startsWith(p))) && typeof value === 'string'
  );
  if (entries.length) await AsyncStorage.multiSet(entries);
}

// First import combines distinct titles and selects the newest progress timestamp.
// Later device writes must use a conflict-safe merge rather than blindly replacing remote data.
function mergeOnFirstImport(local, remote) {
  const combined = { ...remote, ...local };
  for (const key of ['favorites', 'completed_manga']) {
    const oldList = JSON.parse(remote[key] || '[]');
    const newList = JSON.parse(local[key] || '[]');
    const id = x => typeof x === 'string' ? x : x?.url;
    const items = new Map();
    [...oldList,...newList].forEach(x => { if (id(x)) items.set(id(x), x); });
    combined[key] = JSON.stringify([...items.values()]);
  }
  const oldProgress = JSON.parse(remote.lastReadChapters || '{}');
  const localProgress = JSON.parse(local.lastReadChapters || '{}');
  const progress = { ...oldProgress };
  for (const [k,v] of Object.entries(localProgress)) {
    if (!progress[k] || (v.timestamp || 0) >= (progress[k].timestamp || 0)) progress[k] = v;
  }
  combined.lastReadChapters = JSON.stringify(progress);
  return combined;
}

export async function syncLibraryOnce() {
  if (busy) throw new Error('Sync is already in progress');
  busy = true;
  try {
    const local = await getLocal();
    const remote = await request('GET');
    // Conservative first version: only import on an empty cloud account.
    // Existing cloud state is pulled to avoid accidental data loss from this device.
    if (remote.snapshot) {
      await restore(remote.snapshot);
      return { direction: 'download', revision: remote.revision };
    }
    const snapshot = mergeOnFirstImport(local, {});
    const saved = await request('PUT', { snapshot, revision: 0 });
    return { direction: 'upload', revision: saved.revision };
  } finally { busy = false; }
}
