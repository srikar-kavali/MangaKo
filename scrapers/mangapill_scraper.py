from __future__ import annotations
import re, hashlib
from dataclasses import dataclass
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException

BASE_URL = "https://mangapill.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": BASE_URL + "/",
}
REQ_TIMEOUT = 20


def _get(url: str, params: Optional[dict] = None) -> requests.Response:
    r = requests.get(url, params=params, headers=HEADERS, timeout=REQ_TIMEOUT)
    r.raise_for_status()
    return r


def _slugify(s: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9\- ]", "", s).strip().lower().replace(" ", "-")
    return re.sub(r"-+", "-", s)


@dataclass
class Chapter:
    id: str
    number: str
    title: Optional[str]
    url: str
    updated: Optional[str]


@dataclass
class Manga:
    id: str
    title: str
    url: str
    alt_titles: List[str]
    authors: List[str]
    artists: List[str]
    status: Optional[str]
    tags: List[str]
    description: Optional[str]
    cover_url: Optional[str]
    chapters: List[Chapter]


class MangapillScraper:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")

    # ---------- SEARCH ----------
    def search(self, query: str, limit: int = 20) -> List[Dict[str, str]]:
        q = (query or "").strip()
        if not q:
            return []

        url = f"{self.base_url}/search"
        params = {"q": q}
        try:
            resp = _get(url, params=params)
        except RequestException as e:
            # Mangapill is pretty stable; surface the error if any
            raise e

        soup = BeautifulSoup(resp.text, "html.parser")
        results: List[Dict[str, str]] = []
        seen = set()

        # Typical search result links look like: /manga/<id>/<slug>
        for a in soup.select('a[href^="/manga/"]'):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            full = self._abs_url(href)

            if "/manga/" not in full:
                continue
            if full in seen:
                continue
            seen.add(full)

            # Try to get a title from the card
            title = (a.get("title") or a.get_text(" ", strip=True) or "").strip()
            if not title:
                # fallback to any <h3> or <p> near the link
                parent = a.find_parent()
                if parent:
                    h = parent.find(["h2", "h3", "p"])
                    if h:
                        title = h.get_text(" ", strip=True)

            if not title:
                continue

            mid = self._extract_manga_id(full, title)
            results.append({"id": mid, "title": title, "url": full})

            if len(results) >= limit:
                break

        return results

    # ---------- MANGA ----------
    def get_manga(self, manga_url_or_id: str) -> Manga:
        url = (manga_url_or_id or "").strip()
        if not url.startswith("http"):
            # Accept "<id>" or "<id>/<slug>"
            url = f"{self.base_url}/manga/{url.lstrip('/')}"

        resp = _get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Title: often inside h1
        title_el = soup.select_one("h1, h1.title, .manga-title, h2")
        title = (title_el.get_text(strip=True) if title_el else "Unknown").strip()

        # Description
        description = None
        desc_el = soup.select_one(".description, .prose, #description, .summary")
        if desc_el:
            description = desc_el.get_text(" ", strip=True)

        # Tags / genres
        tags: List[str] = []
        for tag_el in soup.select('a[href*="/genres/"], .genres a, .tags a'):
            t = tag_el.get_text(strip=True)
            if t and t.lower() not in [x.lower() for x in tags]:
                tags.append(t)

        # Authors / artists (Mangapill often shows these in a details block)
        authors = self._extract_list_after_label(soup, ["Author", "Authors"])
        artists = self._extract_list_after_label(soup, ["Artist", "Artists"])
        status = self._extract_text_after_label(soup, ["Status"])
        alt_titles = self._extract_list_after_label(soup, ["Alternative", "Alt", "Also known"])

        # Cover image
        cover_url = None
        c = soup.select_one("img[alt*='cover' i], img.cover, .cover img, .object-cover")
        if c:
            cover_url = (c.get("data-src") or c.get("src") or "").strip() or None

        chapters = self._parse_chapters(soup)

        mid = self._extract_manga_id(url, title)
        return Manga(
            id=mid,
            title=title,
            url=url,
            alt_titles=alt_titles,
            authors=authors,
            artists=artists,
            status=status,
            tags=tags,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
        )

    # ---------- PAGES ----------
    def get_chapter_pages(self, chapter_url_or_id: str) -> List[str]:
        url = (chapter_url_or_id or "").strip()
        if not url.startswith("http"):
            # Mangapill chapters look like: /chapter/<id>/<slug>
            url = f"{self.base_url}/chapter/{url.lstrip('/')}"

        resp = _get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Mangapill usually renders <img> with src or data-src for reader pages
        imgs: List[str] = []
        for img in soup.select("img"):
            src = (img.get("data-src") or img.get("src") or "").strip()
            if src.startswith("http"):
                imgs.append(src)

        return self._dedupe(imgs)

    # ---------- Helpers ----------
    def _abs_url(self, href: str) -> str:
        if href.startswith("http"):
            return href
        if not href.startswith("/"):
            href = f"/{href}"
        return f"{self.base_url}{href}"

    @staticmethod
    def _extract_manga_id(href: str, title: str) -> str:
        slug = _slugify(title)
        h = hashlib.md5(href.encode("utf-8")).hexdigest()[:8]
        return f"{slug}-{h}"

    @staticmethod
    def _dedupe(items: List[str]) -> List[str]:
        out, seen = [], set()
        for x in items:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    @staticmethod
    def _extract_list_after_label(soup: BeautifulSoup, labels: List[str], limit: int = 10) -> List[str]:
        out: List[str] = []
        for label in labels:
            els = soup.find_all(string=re.compile(rf"^{label}\s*:", re.I))
            for el in els:
                parent = getattr(el, "parent", None)
                if not parent:
                    continue
                for a in parent.find_all("a"):
                    t = a.get_text(strip=True)
                    if t and t not in out:
                        out.append(t)
        return out[:limit]

    @staticmethod
    def _extract_text_after_label(soup: BeautifulSoup, labels: List[str]) -> Optional[str]:
        for label in labels:
            els = soup.find_all(string=re.compile(rf"^{label}\s*:", re.I))
            for el in els:
                parent = getattr(el, "parent", None)
                if not parent:
                    continue
                text = parent.get_text(" ", strip=True)
                value = re.sub(rf"^{label}\s*:\s*", "", text, flags=re.I).strip()
                if value:
                    return value
        return None

    def _parse_chapters(self, soup: BeautifulSoup) -> List[Chapter]:
        chapters: List[Chapter] = []
        seen = set()

        # Typical chapter links look like: /chapter/<id>/<slug>
        for a in soup.select('a[href^="/chapter/"]'):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            full = self._abs_url(href)
            if full in seen:
                continue
            seen.add(full)

            text = a.get_text(" ", strip=True)
            # Try to extract chapter number
            m = re.search(r"(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)", text, flags=re.I)
            number = m.group(1) if m else ""

            # Optional chapter title after a dash
            title = None
            t = re.search(r"(?:-|–|—)\s*(.+)$", text)
            if t:
                title = t.group(1).strip() or None

            cid = hashlib.md5(full.encode("utf-8")).hexdigest()[:10]
            chapters.append(Chapter(id=cid, number=number, title=title, url=full, updated=None))

        return chapters
