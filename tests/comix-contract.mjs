import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = fs.readFileSync(new URL('../services/comix.js', import.meta.url), 'utf8');
const js = file
  .replaceAll('export function ', 'function ')
  .replaceAll('export async function ', 'async function ')
  + '\n;globalThis.adapter={normalizeComixTitle, searchComix, getComixDetails, getComixChapters};';

const calls = [];
const env = { EXPO_PUBLIC_ENABLE_COMIX: 'true' };
const context = {
  process: { env },
  URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  fetch: async (url) => {
    calls.push(String(url));
    const path = new URL(url).pathname;
    if (path.endsWith('/search')) return {ok:true,json:async()=>({
      results:[{id:'abc-comic',title:'Example',img:'/api/image?url=https%3A%2F%2Fexample.org%2Fcover.jpg',type:'manhwa'}],
      pagination:{current_page:1,last_page:2}
    })};
    if (path.endsWith('/chapters')) return {ok:true,json:async()=>({chapters:[],pagination:{current_page:1}})};
    return {ok:true,json:async()=>({comic:{id:'abc-comic',title:'Example',synopsis:'test'}})};
  }
};
vm.runInNewContext(js, context);
const api = context.adapter;
const search = await api.searchComix('Example');
assert.equal(search.results.length,1);
assert.equal(search.results[0].source,'comix');
assert.equal(search.results[0].cover,'https://comix-api.vercel.app/api/image?url=https%3A%2F%2Fexample.org%2Fcover.jpg');
const detail = await api.getComixDetails('abc-comic');
assert.equal(detail.normalized.title,'Example');
const chapters = await api.getComixChapters('abc-comic');
assert.equal(chapters.chapters.length,0);
assert.equal(calls.length,3);
await assert.rejects(api.getComixDetails('../oops'), /Invalid Comix ID/);
env.EXPO_PUBLIC_ENABLE_COMIX='false';
await assert.rejects(api.searchComix('Example'), /disabled/);
console.log('Comix contract smoke tests passed (mock responses; not live API verification).');
