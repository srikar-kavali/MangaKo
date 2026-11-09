# api/mgeko-search.py
"""Search Mgeko's public catalog without relying on curated MangaKo entries."""
import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

BASE = "https://www.mgeko.cc"
SERIES_PATH = re.compile(r"^/manga/([a-zA-Z0-9][a-zA-Z0-9-]*)/?$")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def title_for(anchor):
    # Results usually contain a series heading; ignore metadata below it.
    heading = anchor.select_one("h2, h3, h4, .title, .manga-title, .name")
    if heading:
        value = heading.get_text(" ", strip=True)
        if value:
            return value
    img = anchor.find("img")
    if img:
        value = (img.get("alt") or "").strip()
        if value and value.lower() not in ("cover", "manga", "image"):
            return value
    text = anchor.get_text(" ", strip=True)
    for separator in ("Author(S):", "Authors:", "Chapters", "Latest"):
        text = text.split(separator, 1)[0]
    return text.strip()


def parse_results(html, limit):
    soup = BeautifulSoup(html, "html.parser")
    results = []
    seen = set()
    for a in soup.select('a[href*="/manga/"]'):
        href = urljoin(BASE, a.get("href") or "")
        parsed = urlparse(href)
        if parsed.hostname not in ("mgeko.cc", "www.mgeko.cc"):
            continue
        matched = SERIES_PATH.match(parsed.path)
        if not matched:
            continue
        slug = matched.group(1).lower()
        if slug in seen:
            continue
        # Some result cards wrap their image, title and metadata in a parent.
        card = a
        name = title_for(a)
        if not name or len(name) < 3:
            parent = a.find_parent(["article", "li", "div"])
            if parent:
                card = parent
                name = title_for(parent)
        if not name or len(name) < 3:
            continue
        cover = None
        img = card.find("img")
        if img:
            for key in ("data-src", "data-original", "src"):
                value = img.get(key)
                if value and not value.startswith("data:"):
                    candidate = urljoin(BASE, value)
                    if urlparse(candidate).scheme == "https":
                        cover = candidate
                    break
        seen.add(slug)
        results.append({
            "id": "mgeko__" + slug,
            "url": href,
            "title": name,
            "cover": cover,
            "coverUrl": cover,
            "source": "mgeko",
        })
        if len(results) >= limit:
            break
    return results


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=120, stale-while-revalidate=300")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        args = parse_qs(urlparse(self.path).query)
        query = (args.get("q") or [""])[0].strip()
        if not query or len(query) > 100:
            return self.send_json(400, {"error": "q must be 1–100 characters"})
        try:
            page = max(1, min(50, int((args.get("page") or ["1"])[0])))
            limit = max(1, min(50, int((args.get("limit") or ["30"])[0])))
        except ValueError:
            return self.send_json(400, {"error": "Invalid pagination"})
        try:
            with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=9.0) as client:
                response = client.get(BASE + "/search/", params={"search": query, "page": page})
                response.raise_for_status()
            if "html" not in response.headers.get("content-type", ""):
                raise ValueError("Search returned non-HTML content")
            matches = parse_results(response.text, limit)
            return self.send_json(200, {
                "results": matches, "page": page,
                "hasMore": bool(BeautifulSoup(response.text, "html.parser").find(
                    "a", string=re.compile(r"Next", re.I))),
            })
        except Exception as exc:
            print("Mgeko search unavailable:", type(exc).__name__, str(exc)[:180])
            return self.send_json(502, {"error": "Mgeko search is temporarily unavailable"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()
