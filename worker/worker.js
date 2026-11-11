// Cloudflare edge image proxy. Only fetches approved public manga image hosts.
// Deploy with: cd worker && npx wrangler deploy
const ALLOWED_HOSTS = new Set([
  'mangapill.com', 'www.mangapill.com',
  'readdetectiveconan.com', 'cdn.readdetectiveconan.com',
  'mgeko.cc', 'www.mgeko.cc',
  'asurascans.com', 'cdn.asurascans.com',
  'asuracomic.net', 'gg.asuracomic.net',
  'uploads.mangadex.org', 'mangadex.org', 'api.mangadex.org',
  'm.media-amazon.com',
]);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function allowedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host) && !/^imgsrv[0-9]+\.com$/.test(host)) return null;
    return u;
  } catch { return null; }
}
function upstreamHeaders(host) {
  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
  });
  if (host.includes('mangapill') || host.includes('readdetectiveconan')) {
    headers.set('Referer', 'https://mangapill.com/');
  } else if (host.startsWith('imgsrv') || host.includes('mgeko')) {
    headers.set('Referer', 'https://www.mgeko.cc/');
  } else if (host.includes('asura')) {
    headers.set('Referer', 'https://asurascans.com/');
  }
  return headers;
}
function error(status, message) {
  return new Response(message, {
    status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!['GET', 'HEAD'].includes(request.method)) return error(405, 'Method not allowed');
    const requestUrl = new URL(request.url);
    const target = allowedUrl(requestUrl.searchParams.get('url'));
    if (!target) return error(400, 'Missing or disallowed image URL');

    const cache = caches.default;
    const cacheKey = new Request(requestUrl.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Proxy-Cache', 'HIT');
      return new Response(request.method === 'HEAD' ? null : cached.body, { status: cached.status, headers });
    }

    try {
      // Some Mgeko cover links were saved on imgsrv4, while the same
      // image is mirrored on imgsrv5. Try at most one alternate host for
      // image-server URLs; never retry unrelated sources or private hosts.
      const mirrors = [target];
      const mirrorMatch = target.hostname.match(/^imgsrv([0-9]+)\.com$/);
      if (mirrorMatch) {
        const mirrorNum = Number(mirrorMatch[1]) === 4 ? 5 : 4;
        const mirror = new URL(target.toString());
        mirror.hostname = 'imgsrv' + mirrorNum + '.com';
        mirrors.push(mirror);
      }

      let data, type;
      for (const candidate of mirrors) {
        let current = candidate;
        for (let i = 0; i <= MAX_REDIRECTS; i++) {
          const response = await fetch(current.toString(), {
            method: 'GET',
            headers: upstreamHeaders(current.hostname),
            redirect: 'manual',
          });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            const redirected = location ? allowedUrl(new URL(location, current).toString()) : null;
            if (!redirected) break;
            current = redirected;
            continue;
          }
          if (!response.ok) break;
          const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
          if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') break;
          const length = Number(response.headers.get('content-length') || 0);
          if (length > MAX_BYTES) break;
          const body = await response.arrayBuffer();
          if (body.byteLength > MAX_BYTES) break;
          type = contentType;
          data = body;
          break;
        }
        if (data) break;
      }
      if (!data) return error(502, 'Upstream image unavailable');
      const headers = new Headers({
        ...CORS,
        'Content-Type': type,
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'public, max-age=86400',
        'X-Proxy-Cache': 'MISS',
      });
      const output = new Response(data, { status: 200, headers });
      ctx.waitUntil(cache.put(cacheKey, output.clone()));
      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers })
        : output;
    } catch {
      return error(502, 'Unable to retrieve image');
    }
  },
};
