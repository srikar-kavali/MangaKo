import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAuthSession } from 'aws-amplify/auth';

const API = (process.env.EXPO_PUBLIC_CHAPTERS_API || '').replace(/\/+$/, '');
const KEYS = ['favorites', 'lastReadChapters', 'hiddenContinueReading', 'completed_manga'];
const PREFIXES = ['status:', 'lastviewed:'];
const META_OWNER = '@mangako/sync-owner';
const META_BASE = '@mangako/sync-base:';
const META_PENDING = '@mangako/sync-pending:';
let activeSync = null;
let debounceTimer = null;

const isSyncKey = key => KEYS.includes(key) || PREFIXES.some(prefix => key.startsWith(prefix));
const safeParse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function identity() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const userId = session.tokens?.idToken?.payload?.sub;
  if (!token || !userId) throw new Error('Please sign in to synchronize your library');
  return { token, userId };
}

async function request(token, method, payload) {
  if (!API) throw new Error('EXPO_PUBLIC_CHAPTERS_API is missing');
  const response = await fetch(`${API}/api/library-sync`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new Error(data.error || `Sync request failed (HTTP ${response.status})`);
  return data;
}

async function readLocal() {
  const all = await AsyncStorage.getAllKeys();
  const keys = [...new Set([...KEYS, ...all.filter(isSyncKey)])];
  const entries = await AsyncStorage.multiGet(keys);
  return Object.fromEntries(entries.filter(([key, value]) => isSyncKey(key) && value !== null));
}

async function applyLocal(snapshot) {
  const existingKeys = (await AsyncStorage.getAllKeys()).filter(isSyncKey);
  const entries = Object.entries(snapshot).filter(([key, val]) => isSyncKey(key) && typeof val === 'string');
  const restoredKeys = new Set(entries.map(([key]) => key));
  const missing = existingKeys.filter(key => !restoredKeys.has(key));
  if (entries.length) await AsyncStorage.multiSet(entries);
  if (missing.length) await AsyncStorage.multiRemove(missing);
}

// Merge against the device's previously synchronized baseline. Only changed
// fields may overwrite remote fields; identical or untouched fields stay remote.
function mergeMap(key, local, remote, base) {
  const l = safeParse(local, {});
  const r = safeParse(remote, {});
  const b = safeParse(base, {});
  const result = { ...r };
  for (const field of new Set([...Object.keys(l), ...Object.keys(b)])) {
    if (same(l[field], b[field])) continue;
    if (key === 'lastReadChapters' && l[field] && r[field] &&
        Number(l[field].timestamp || 0) < Number(r[field].timestamp || 0)) continue;
    if (field in l) result[field] = l[field];
    else delete result[field];
  }
  return JSON.stringify(result);
}

function mergeList(local, remote, base) {
  const byId = (raw) => {
    const list = safeParse(raw, []);
    return new Map((Array.isArray(list) ? list : []).filter(x => typeof x === 'string' || x?.url)
      .map(x => [typeof x === 'string' ? x : x.url, x]));
  };
  const l = byId(local), r = byId(remote), b = byId(base);
  for (const key of new Set([...l.keys(), ...b.keys()])) {
    if (same(l.get(key), b.get(key))) continue;
    if (l.has(key)) r.set(key, l.get(key));
    else r.delete(key);
  }
  return JSON.stringify([...r.values()]);
}

function mergeSnapshots(local, remote, baseline, firstImport) {
  const result = { ...remote };
  for (const key of new Set([...Object.keys(local), ...Object.keys(baseline)])) {
    if (!isSyncKey(key) || local[key] === baseline[key]) continue;
    // On initial import, merge pre-existing local titles into the account.
    // For subsequent syncs, additions/removals use the previous baseline.
    if (key === 'favorites' || key === 'completed_manga') {
      result[key] = mergeList(local[key], remote[key], firstImport ? '[]' : baseline[key]);
    } else if (key === 'lastReadChapters' || key === 'hiddenContinueReading') {
      result[key] = mergeMap(key, local[key], remote[key], firstImport ? '{}' : baseline[key]);
    } else if (firstImport && Object.prototype.hasOwnProperty.call(remote, key)) {
      // Existing cloud statuses win on first import unless no cloud value exists.
      continue;
    } else if (key in local) {
      result[key] = local[key];
    } else {
      delete result[key];
    }
  }
  return result;
}

async function performSync() {
  const { token, userId } = await identity();
  const previousOwner = await AsyncStorage.getItem(META_OWNER);
  const baselineText = await AsyncStorage.getItem(META_BASE + userId);
  const baseline = baselineText ? safeParse(baselineText, {}) : {};
  // Prevent uploading local state belonging to a different signed-in account.
  const differentAccount = !!previousOwner && previousOwner !== userId;
  const initialImport = !baselineText && !differentAccount;
  const local = differentAccount ? {} : await readLocal();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cloud = await request(token, 'GET');
    const remote = cloud.snapshot || {};
    const merged = differentAccount ? remote :
      mergeSnapshots(local, remote, baseline, initialImport);
    if (!same(merged, remote)) {
      const saved = await request(token, 'PUT', { snapshot: merged, revision: cloud.revision });
      if (saved.conflict) continue;
    }
    // Do not overwrite changes made locally while this network request was pending.
    const newestLocal = differentAccount ? {} : await readLocal();
    if (!differentAccount && !same(newestLocal, local)) {
      await AsyncStorage.setItem(META_BASE + userId, JSON.stringify(remote));
      queueLibrarySync();
      return { direction: 'retry-pending' };
    }
    await applyLocal(merged);
    await AsyncStorage.multiSet([
      [META_OWNER, userId],
      [META_BASE + userId, JSON.stringify(merged)],
    ]);
    return { direction: 'synchronized' };
  }
  throw new Error('Cloud changed during sync. Please retry.');
}

export function syncLibraryOnce() {
  if (activeSync) return activeSync;
  activeSync = performSync().finally(() => { activeSync = null; });
  return activeSync;
}

export function queueLibrarySync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncLibraryOnce().catch(() => {
      // Local reading remains available offline; subsequent activity or manual
      // sync will retry. Do not silently discard local data.
    });
  }, 1500);
}

export function stopLibrarySync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
}
