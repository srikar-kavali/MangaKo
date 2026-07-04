export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetUrlStr = url.searchParams.get("url");

        if (!targetUrlStr) {
            return new Response("Missing 'url' parameter", { status: 400 });
        }

        // 1. Check Cloudflare's Edge Cache first
        const cache = caches.default;
        const cacheKey = new Request(request.url, request);
        let cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
            const headers = new Headers(cachedResponse.headers);
            headers.set("X-Proxy-Cache", "HIT");
            return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers
            });
        }

        try {
            const targetUrl = new URL(targetUrlStr);
            const host = targetUrl.netloc || targetUrl.hostname;

            // 2. Mirror your exact working Python proxy headers
            const headers = new Headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Fetch-Dest": "image",
                "Sec-Fetch-Mode": "no-cors",
                "Sec-Fetch-Site": "cross-site",
                "Host": host
            });

            // Match the pristine referrer mapping from your Python code
            if (host.includes("asura") || host.includes("gg.asuracomic")) {
                headers.set("Referer", "https://asurascans.com/");
                headers.set("Origin", "https://asurascans.com");
            } else if (host.includes("readdetectiveconan.com") || host.includes("mangapill")) {
                headers.set("Referer", "https://mangapill.com/");
                headers.set("sec-ch-ua", '"Not_A Brand";v="8", "Chromium";v="120"');
                headers.set("sec-ch-ua-mobile", "?0");
                headers.set("sec-ch-ua-platform", '"Windows"');
            } else if (host.includes("imgsrv4.com") || host.includes("mgeko")) {
                headers.set("Referer", "https://mgeko.cc/");
            } else {
                headers.set("Referer", `https://${host.replace('cdn.', '')}/`);
            }

            // 3. Fetch the image from the upstream server
            const response = await fetch(targetUrl.toString(), { headers });

            if (!response.ok) {
                return new Response(`Upstream server responded with status: ${response.status}`, {
                    status: response.status
                });
            }

            // 4. Prepare clean headers for the client response
            const responseHeaders = new Headers(response.headers);

            responseHeaders.set("Access-Control-Allow-Origin", "*");
            responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

            // Match your Python app's strong 1-year immutable caching
            responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
            responseHeaders.set("X-Proxy-Cache", "MISS");

            const modifiedResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
            });

            // 5. Cache asynchronously
            ctx.waitUntil(cache.put(cacheKey, modifiedResponse.clone()));

            return modifiedResponse;

        } catch (error) {
            return new Response(`Proxy error: ${error.message}`, { status: 500 });
        }
    },
};