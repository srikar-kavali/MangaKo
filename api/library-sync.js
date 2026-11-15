import { createClient } from '@supabase/supabase-js';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_lcEuXN4mz',
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID || '5fa3q84jk2o1ba4079klpgevtc',
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const allowedOrigins = (process.env.SYNC_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

export default function handler(req, res) {
  return syncLibrary(req, res, verifier, supabase, allowedOrigins);
}

export async function syncLibrary(req, res, verifier, supabase, allowedOrigins) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let identity;
  try { identity = await verifier.verify(token); }
  catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
  const userId = identity?.sub;
  if (typeof userId !== 'string' || !userId) return res.status(401).json({ error: 'Invalid session identity' });
  const { snapshot, revision } = req.body || {};
  if (req.method === 'PUT' && (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      Buffer.byteLength(JSON.stringify(snapshot)) > 1_000_000 ||
      !Object.values(snapshot).every(value => typeof value === 'string') ||
      !Number.isSafeInteger(revision) || revision < 0)) {
    return res.status(400).json({ error: 'Invalid sync payload' });
  }
  try {
    const { data, error } = await supabase.from('user_library_sync')
      .select('snapshot,revision,updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (req.method === 'GET') return res.status(200).json({ snapshot: data?.snapshot ?? null, revision: data?.revision ?? 0, updatedAt: data?.updated_at ?? null });
    if (revision !== (data?.revision ?? 0))
      return res.status(409).json({ error: 'Revision conflict', snapshot: data?.snapshot ?? null, revision: data?.revision ?? 0 });
    // A compare-and-set update prevents clobbering concurrent devices.
    if (data) {
      const result = await supabase.from('user_library_sync')
        .update({ snapshot, revision: data.revision + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('revision', data.revision)
        .select('revision').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return res.status(409).json({ error: 'Revision conflict' });
      return res.status(200).json({ revision: result.data.revision });
    }
    const result = await supabase.from('user_library_sync')
      .insert({ user_id: userId, snapshot, revision: 1 }).select('revision').single();
    if (result.error?.code === '23505') return res.status(409).json({ error: 'Revision conflict' });
    if (result.error) throw result.error;
    return res.status(200).json({ revision: result.data.revision });
  } catch (error) {
    console.error('library-sync failure', error?.code || 'unknown');
    return res.status(500).json({ error: 'Sync temporarily unavailable' });
  }
}
