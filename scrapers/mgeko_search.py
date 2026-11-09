import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

BASE = "https://www.mgeko.cc"
SERIES_PATH = re.compile(r"^/manga/([a-zA-Z0-9][a-zA-Z0-9-]*)/?$")
LEGACY_ID_ALIASES = {
    "manga-pl822": "noblesse",
    "manga-si7aaa": "tower-of-god",
    "manga-q1113": "eleceed",
    "manga-187j": "the-boxer",
    "7237": "the-god-of-high-school",
    "northern-b-manhwa": "legend-of-the-northern-blade",
    "leviathansdads": "leviathan",
    "wind-breaker-cs": "wind-breaker",
    "memoir-of-the-king-of-war-sop": "memoir-of-the-king-of-war",
    "chronicles-of-heavenly-demon-mg1": "chronicles-of-the-heavenly-demon",
    "eternal-force": "the-breaker-eternal-force",
    "the-breaker22": "the-breaker",
    "the-story-of-a-low-rank-soldier-becoming-a-monarch-mg1": "the-story-of-a-low-rank-soldier-becoming-a-monarch",
    "manga-mm990169": "mage-again",
    "manga-1089": "hardcore-leveling-warrior",
}

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
            "id": "mgeko__" + LEGACY_ID_ALIASES.get(slug, slug),
            "url": href,
            "title": name,
            "cover": cover,
            "coverUrl": cover,
            "source": "mgeko",
        })
        if len(results) >= limit:
            break
    return results


def search_mgeko(query, limit=30, page=1):
    if not query or len(query) > 100:
        raise ValueError("Invalid Mgeko search query")
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=9.0) as client:
        response = client.get(BASE + "/search/", params={"search": query, "page": page})
        response.raise_for_status()
    if "html" not in response.headers.get("content-type", ""):
        raise ValueError("Mgeko search returned non-HTML content")
    return {
        "results": parse_results(response.text, limit),
        "page": page,
        "hasMore": bool(BeautifulSoup(response.text, "html.parser").find(
            "a", string=re.compile(r"Next", re.I))),
    }
