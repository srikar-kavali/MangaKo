import test from 'node:test';
import assert from 'node:assert/strict';
import chapterPages from '../api/mangadex/chapter-pages.js';
import retiredProxy from '../api/mangadex/image.js';

process.env.SUPABASE_URL = 'https://database.example.com';
process.env.SUPABASE_SERVICE_KEY = 'unit-test-only';
const { syncLibrary } = await import('../api/library-sync.js');

function response() {
  return {
    headers: {}, code: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('retired MangaDex proxy makes no upstream request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected request'));
  const res = response();
  await retiredProxy({}, res);
  assert.equal(res.code, 410);
  assert.equal(fetch.mock.callCount(), 0);
});

test('chapter lookup returns validated direct MangaDex image URLs', async t => {
  const chapterId = '12345678-1234-1234-1234-123456789abc';
  const hash = 'a'.repeat(32);
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `https://api.mangadex.org/at-home/server/${chapterId}?forcePort443=true`);
    assert.equal(options.redirect, 'error');
    return Response.json({
      result: 'ok', baseUrl: 'https://node.mangadex.network/token/',
      chapter: { hash, dataSaver: ['x1-example.jpg'] },
    });
  });
  const res = response();
  await chapterPages({ method: 'GET', query: { chapterId, quality: 'data-saver' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.pages, [`https://node.mangadex.network/token/data-saver/${hash}/x1-example.jpg`]);
  assert.equal(fetch.mock.callCount(), 1);
});

test('library sync rejects missing and invalid tokens before database access', async () => {
  const db = { from() { assert.fail('Unexpected database access'); } };
  const verifier = { async verify() { throw new Error('Invalid token'); } };
  for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
    const res = response();
    await syncLibrary({ method: 'GET', headers }, res, verifier, db, []);
    assert.equal(res.code, 401);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('library reads and writes use only the verified token subject', async () => {
  const calls = [];
  const verifier = { async verify() { return { sub: 'verified-account' }; } };
  const db = {
    from(table) {
      assert.equal(table, 'user_library_sync');
      return {
        select() { return this; },
        eq(...args) { calls.push(args); return this; },
        async maybeSingle() { return { data: null }; },
        insert(record) { calls.push(record); return this; },
        async single() { return { data: { revision: 1 } }; },
      };
    },
  };
  const req = { method: 'PUT', headers: { authorization: 'Bearer test' }, query: { user_id: 'another-account' },
    body: { user_id: 'another-account', snapshot: { favorites: '[]' }, revision: 0 } };
  const res = response();
  await syncLibrary(req, res, verifier, db, []);
  assert.equal(res.code, 200);
  assert.deepEqual(calls, [['user_id', 'verified-account'], { user_id: 'verified-account', snapshot: { favorites: '[]' }, revision: 1 }]);
});

test('oversized UTF-8 snapshots are rejected before database access', async () => {
  const res = response();
  await syncLibrary({
    method: 'PUT', headers: { authorization: 'Bearer test' },
    body: { snapshot: { favorites: '😀'.repeat(250_001) }, revision: 0 },
  }, res, { async verify() { return { sub: 'account' }; } }, { from() { assert.fail('Unexpected database access'); } }, []);
  assert.equal(res.code, 400);
});
