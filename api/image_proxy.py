# api/image_proxy.py
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
import re
import httpx


IMGSRV_HOST_RE = re.compile(r'^imgsrv(\d+)\.com$', re.IGNORECASE)
IMGSRV_FALLBACK_COUNT = 8

def imgsrv_fallback_urls(url: str) -> list:
    parsed = urlparse(url)
    m = IMGSRV_HOST_RE.match(parsed.netloc)
    if not m:
        return []
    original_n = int(m.group(1))
    candidates = sorted(
        (n for n in range(1, IMGSRV_FALLBACK_COUNT + 1) if n != original_n),
        key=lambda n: abs(n - original_n)
    )
    return [
        parsed._replace(netloc=f"imgsrv{n}.com").geturl()
        for n in candidates
    ]


def get_headers(url: str) -> dict:
    parsed = urlparse(url)
    host = parsed.netloc

    # Base configuration mimicking a pristine, human browser context
    base = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
    }

    # Dynamic match for anything matching the Asura infrastructure
    if any(keyword in host for keyword in ["asura", "gg.asuracomic"]):
        return {
            **base,
            "Referer": "https://asurascans.com/",
            "Origin": "https://asurascans.com",
            "Host": host
        }

    if "readdetectiveconan.com" in host or "mangapill" in host:
        return {
            **base,
            "Referer": "https://mangapill.com/",
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "Host": host
        }

    if "imgsrv4.com" in host or "mgeko" in host:
        # NOTE: every real mgeko URL we've observed is under www.mgeko.cc —
        # "https://mgeko.cc/" (no www) is a different origin as far as most
        # hotlink-protection checks are concerned, even though it happens to
        # redirect fine for a normal browser visit. Referer checks are
        # typically a strict prefix/string match, not a "does this resolve
        # to the same site" check, so this mismatch was likely causing
        # imgsrv4.com to silently reject every proxied image request.
        return {
            **base,
            "Referer": "https://www.mgeko.cc/",
            "Origin": "https://www.mgeko.cc",
            "Host": host
        }

    return {
        **base,
        "Referer": f"https://{host.replace('cdn.', '')}/",
        "Host": host
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        url = unquote(params.get('url', [''])[0])

        if not url or not url.startswith('http'):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid URL"}')
            return

        # Old scraped imgsrv{N}.com links can go stale if mgeko has since
        # reshuffled that chapter's images onto a different numbered host.
        candidate_urls = [url] + imgsrv_fallback_urls(url)

        try:
            last_error = None
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                for candidate in candidate_urls:
                    try:
                        r = client.get(candidate, headers=get_headers(candidate))
                        r.raise_for_status()

                        content_type = r.headers.get('content-type', 'image/jpeg')
                        if not content_type.startswith('image/'):
                            content_type = 'image/jpeg'

                        self.send_response(200)
                        self.send_header('Content-Type', content_type)
                        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Content-Length', str(len(r.content)))
                        if candidate != url:
                            # Surface which fallback actually worked, useful for
                            # debugging/monitoring which hosts are currently stale.
                            self.send_header('X-Proxy-Fallback-Host', urlparse(candidate).netloc)
                        self.end_headers()
                        self.wfile.write(r.content)
                        return

                    except httpx.HTTPStatusError as e:
                        last_error = e
                        # Only worth trying other hosts for client-side rejection
                        # (dead/moved link, blocked referer, etc) — a 5xx from a
                        # given host means try the next candidate too, so we
                        # just fall through and keep looping either way.
                        continue

            # Every candidate host failed
            raise last_error

        except httpx.TimeoutException:
            self.send_response(504)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":"Timeout fetching image"}')
        except httpx.HTTPStatusError as e:
            self.send_response(e.response.status_code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(f'{{"error":"Upstream error: {e.response.status_code}"}}'.encode())
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(f'{{"error":"Failed: {str(e)}"}}'.encode())