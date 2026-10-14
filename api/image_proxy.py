"""Bounded, allowlisted image proxy for the manga reader."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import ipaddress
import json
import os
import re
import socket

import httpx

# Add other verified image origins with IMAGE_PROXY_ALLOWED_HOSTS on the server.
DEFAULT_HOSTS = {
    "mangapill.com", "www.mangapill.com", "readdetectiveconan.com",
    "mgeko.cc", "www.mgeko.cc", "asurascans.com",
    "cdn.asurascans.com", "asuracomic.net", "gg.asuracomic.net",
    "uploads.mangadex.org", "mangadex.org", "api.mangadex.org",
}
IMGSRV_RE = re.compile(r"^imgsrv[0-9]+\.com$", re.I)
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_REDIRECTS = 3
MAX_FALLBACKS = 2


def permitted_host(host):
    if not host:
        return False
    host = host.lower().rstrip(".")
    allowed = DEFAULT_HOSTS | {
        h.strip().lower() for h in os.getenv("IMAGE_PROXY_ALLOWED_HOSTS", "").split(",") if h.strip()
    }
    return host in allowed or bool(IMGSRV_RE.fullmatch(host))


def validate_image_url(url):
    try:
        p = urlparse(url)
        host = p.hostname
        if p.scheme != "https" or not host or p.username or p.password or p.port not in (None, 443):
            return False
        if not permitted_host(host):
            return False
        # Reject IP literals; only explicit, trusted DNS image origins are supported.
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            pass
        return True
    except (ValueError, TypeError):
        return False


def validate_dns(host):
    """Fail closed when an otherwise trusted hostname resolves to a local address."""
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        return bool(addresses) and all(
            ipaddress.ip_address(entry[4][0]).is_global for entry in addresses
        )
    except (OSError, ValueError):
        return False


def fallback_urls(url):
    p = urlparse(url)
    match = IMGSRV_RE.fullmatch(p.hostname or "")
    if not match:
        return []
    n = int(re.search(r"[0-9]+", p.hostname).group())
    others = sorted((i for i in range(1, 9) if i != n), key=lambda i: abs(i - n))
    return [p._replace(netloc=f"imgsrv{i}.com").geturl() for i in others[:MAX_FALLBACKS]]


def request_headers(host):
    headers = {"User-Agent": "MangaKo-ImageProxy/1.0", "Accept": "image/*"}
    if "mangapill" in host or host == "readdetectiveconan.com":
        headers["Referer"] = "https://mangapill.com/"
    elif host.startswith("imgsrv") or "mgeko" in host:
        headers["Referer"] = "https://www.mgeko.cc/"
    elif "asura" in host:
        headers["Referer"] = "https://asurascans.com/"
    return headers


def fetch_image(url):
    with httpx.Client(timeout=httpx.Timeout(8.0, connect=4.0), follow_redirects=False, trust_env=False) as client:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            if not validate_image_url(current):
                raise ValueError("Image origin not allowed")
            host = urlparse(current).hostname
            if not validate_dns(host):
                raise ValueError("Image hostname does not resolve to a public address")
            with client.stream("GET", current, headers=request_headers(host)) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    from urllib.parse import urljoin
                    target = urljoin(current, response.headers.get("location", ""))
                    if not validate_image_url(target):
                        raise ValueError("Redirect origin not allowed")
                    current = target
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").split(";")[0].lower()
                if not content_type.startswith("image/") or content_type == "image/svg+xml":
                    raise ValueError("Upstream response is not a supported raster image")
                if int(response.headers.get("content-length", "0")) > MAX_IMAGE_BYTES:
                    raise ValueError("Image is too large")
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise ValueError("Image is too large")
                return bytes(data), content_type
        raise ValueError("Too many image redirects")


class handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = json.dumps({"error": payload}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        url = params.get("url", [""])[0]
        if not validate_image_url(url):
            return self.reply(400, "Invalid or disallowed image URL")
        for candidate in [url, *fallback_urls(url)]:
            try:
                data, content_type = fetch_image(candidate)
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                self.wfile.write(data)
                return
            except (httpx.HTTPError, ValueError, OSError):
                continue
        self.reply(502, "Could not retrieve image")
