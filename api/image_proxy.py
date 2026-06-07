# api/image_proxy.py
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote
import httpx


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
        return {**base, "Referer": "https://mgeko.cc/", "Host": host}

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

        headers = get_headers(url)

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                r = client.get(url, headers=headers)
                r.raise_for_status()

                content_type = r.headers.get('content-type', 'image/jpeg')
                if not content_type.startswith('image/'):
                    content_type = 'image/jpeg'

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(r.content)))
                self.end_headers()
                self.wfile.write(r.content)

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