// Cloudflare edge image proxy. Only fetches approved public manga image hosts.
// Deploy with: cd worker && npx wrangler deploy
const ALLOWED_HOSTS = new Set([
  'mangapill.com', 'www.mangapill.com',
  'readdetectiveconan.com', 'cdn.readdetectiveconan.com',
  'mgeko.cc', 'www.mgeko.cc',
  'asurascans.com', 'cdn.asurascans.com',
  'asuracomic.net', 'gg.asuracomic.net',
  'uploads.mangadex.org', 'mangadex.org', 'api.mangadex.org',
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
    'User-Agent': 'Mozilla/5.0 (compatible; MangaKo/1.0)',
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
      let current = target;
      let response;
      for (let i = 0; i <= MAX_REDIRECTS; i++) {
        response = await fetch(current.toString(), {
          method: 'GET',
          headers: upstreamHeaders(current.hostname),
          redirect: 'manual',
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          const redirected = location ? allowedUrl(new URL(location, current).toString()) : null;
          if (!redirected) return error(502, 'Upstream redirect not allowed');
          current = redirected;
          continue;
        }
        break;
      }
      if (!response || [301, 302, 303, 307, 308].includes(response.status)) return error(502, 'Too many redirects');
      if (!response.ok) return error(502, 'Upstream image unavailable');
      const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!type.startsWith('image/') || type === 'image/svg+xml') return error(502, 'Unsupported image content');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_BYTES) return error(413, 'Image too large');
      const data = await response.arrayBuffer();
      if (data.byteLength > MAX_BYTES) return error(413, 'Image too large');
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
