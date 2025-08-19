# scrapers/weebcentral_scraper.py
from __future__ import annotations

import os
import re
import hashlib
from dataclasses import dataclass
from typing import List, Dict, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException

BASE_URL = "https://weebcentral.com"

# Toggle to see debug prints (useful locally or in Vercel logs)
DEBUG = False

# Allow overriding crawl depth via env var on Vercel (default 5)
MAX_INDEX_PAGES = int(os.getenv("WEEBCENTRAL_MAX_PAGES", "5"))

# Strong headers to reduce blocking
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://weebcentral.com/",
}
REQ_TIMEOUT = 20

# WeebCentral IDs look like 26 chars starting with "01"
_WCID_RE = re.compile(r"^01[0-9A-Z]{24}$", re.I)


def _get(url: str, params: Optional[dict] = None) -> requests.Response:
    r = requests.get(url, params=params, headers=HEADERS, timeout=REQ_TIMEOUT)
    r.raise_for_status()
    return r


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\- ]", "", s).strip().lower().replace(" ", "-")
    return re.sub(r"-+", "-", s)


def _is_wc_series_url(s: str) -> bool:
    try:
        u = urlparse(s)
        return (
                u.scheme in ("http", "https")
                and u.netloc.endswith("weebcentral.com")
                and "/series/" in u.path
        )
    except Exception:
        return False


def _looks_like_wc_id(s: str) -> bool:
    return bool(_WCID_RE.match((s or "").strip()))


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


class WeebCentralScraper:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")

    # ---------- SEARCH ----------
    def search(self, query: str, limit: int = 20) -> List[Dict[str, str]]:
        q = (query or "").strip()
        if not q:
            return []

        # Fast path 1: direct series URL
        if _is_wc_series_url(q):
            try:
                r = _get(q)
                soup = BeautifulSoup(r.text, "html.parser")
                title_el = soup.select_one("h1, h2.title, .series-title, .manga-title")
                title = (title_el.get_text(strip=True) if title_el else q).strip()
                low = q.rstrip("/").lower()
                if title and not low.endswith("/series/random"):
                    return [{
                        "id": self._extract_manga_id(q, title),
                        "title": title,
                        "url": q,
                    }]
            except RequestException as e:
                if DEBUG: print("direct-url failed:", e)
            # continue to other strategies

        # Fast path 2: raw ID
        if _looks_like_wc_id(q):
            candidates = [
                f"{self.base_url}/series/{q}",
                f"{self.base_url}/series/{q}/",
            ]
            for url in candidates:
                try:
                    r = _get(url)
                    soup = BeautifulSoup(r.text, "html.parser")
                    title_el = soup.select_one("h1, h2.title, .series-title, .manga-title")
                    title = (title_el.get_text(strip=True) if title_el else url).strip()
                    low = url.rstrip("/").lower()
                    if title and not low.endswith("/series/random"):
                        return [{
                            "id": self._extract_manga_id(url, title),
                            "title": title,
                            "url": url,
                        }]
                except RequestException:
                    continue
            # continue to search fallback

        # Try site /search page with multiple param names
        search_url = f"{self.base_url}/search"
        param_sets = [{"keyword": q}, {"q": q}, {"s": q}, {"search": q}, {"title": q}]
        for params in param_sets:
            try:
                resp = requests.get(search_url, params=params, headers=HEADERS, timeout=REQ_TIMEOUT)
                if DEBUG:
                    print("SEARCH URL:", resp.url, "status:", resp.status_code, "len:", len(resp.text))
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "html.parser")
                hits = self._collect_series_from_soup(soup)
                filtered = self._filter_by_query(hits, q)
                final = self._dedupe_and_limit(filtered or hits, limit)
                if final:
                    return final
            except RequestException as e:
                if DEBUG:
                    print("search() params failed:", params, "err:", e)
                # try next param style

        # Fallback: crawl /series index pages
        index_paths = ["/series/"] + [f"/series/page/{i}/" for i in range(2, MAX_INDEX_PAGES + 1)]
        collected: List[Dict[str, str]] = []
        last_err: Optional[Exception] = None

        for path in index_paths:
            url = f"{self.base_url.rstrip('/')}{path}"
            try:
                resp = requests.get(url, headers=HEADERS, timeout=REQ_TIMEOUT)
                if DEBUG:
                    print("INDEX URL:", resp.url, "status:", resp.status_code, "len:", len(resp.text))
                if resp.status_code == 404:
                    break
                if resp.status_code >= 500:
                    continue
                resp.raise_for_status()

                soup = BeautifulSoup(resp.text, "html.parser")
                page_hits = self._collect_series_from_soup(soup)

                matched_now = self._filter_by_query(page_hits, q)
                if matched_now:
                    return self._dedupe_and_limit(matched_now, limit)

                collected.extend(page_hits)
                if len(collected) >= 500:
                    break

            except RequestException as e:
                last_err = e
                if DEBUG:
                    print("index crawl error:", e)
                continue

        filtered = self._filter_by_query(collected, q)
        final = self._dedupe_and_limit(filtered, limit)
        if final:
            return final

        if last_err:
            raise last_err

        return []

    # ---------- MANGA ----------
    def get_manga(self, manga_url_or_id: str) -> Manga:
        url = (manga_url_or_id or "").strip()
        if not url.startswith("http"):
            url = f"{self.base_url}/series/{url.lstrip('/')}"

        resp = _get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        title_el = soup.select_one("h1, h2.title, .series-title, .manga-title")
        title = (title_el.get_text(strip=True) if title_el else "Unknown").strip()

        description = None
        desc_el = soup.select_one(".description, #description, .manga-description, .series-desc, .summary")
        if desc_el:
            description = desc_el.get_text(" ", strip=True)

        tags: List[str] = []
        for tag_el in soup.select(".genre, .genres a, .tags a, a[href*='/genre/']"):
            t = tag_el.get_text(strip=True)
            if t and t.lower() not in [x.lower() for x in tags]:
                tags.append(t)

        alt_titles = self._extract_list_after_label(soup, ["Alternate", "Alt", "Also known"])
        authors = self._extract_list_after_label(soup, ["Author"])
        artists = self._extract_list_after_label(soup, ["Artist"])
        status = self._extract_text_after_label(soup, ["Status"])
        cover_url = self._extract_cover(soup)
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
            url = f"{self.base_url}/read/{url.lstrip('/')}"

        resp = _get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        imgs: List[str] = []
        for img in soup.select("img.page, img.reader, .reader-area img, .page img, #reader img"):
            src = (img.get("data-src") or img.get("src") or "").strip()
            if src.startswith("http"):
                imgs.append(src)

        if not imgs:
            for script in soup.find_all("script"):
                txt = script.string or script.get_text()
                if not txt:
                    continue
                found = re.findall(r'https?://[^\s\'"]+\.(?:jpe?g|png|webp)', txt, flags=re.I)
                imgs.extend(found)

        return self._dedupe(imgs)

    # ---------- Helpers ----------
    def _collect_series_from_soup(self, soup: BeautifulSoup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        seen = set()
        for a in soup.select(
                'a[href^="/series/"], .series-list a[href^="/series/"], '
                '.search-results a[href^="/series/"], a.series, a.manga, .series a, .manga a, '
                'a[href*="/series/"]'
        ):
            href = (a.get("href") or "").strip()
            if not href:
                continue
            full = self._abs_url(href)
            low = full.lower()

            if "/series/" not in low:
                continue
            if low.rstrip("/").endswith("/series/random"):
                continue
            if any(x in low for x in ("/chapter", "/chapters", "/read/")):
                continue
            if full in seen:
                continue

            title = (a.get("title") or a.get_text(" ", strip=True) or "").strip()
            if not title:
                parent = a.find_parent()
                if parent:
                    h = parent.find(["h2", "h3"])
                    if h:
                        title = h.get_text(" ", strip=True)
            if not title:
                continue

            mid = self._extract_manga_id(full, title)
            out.append({"id": mid, "title": title, "url": full})
            seen.add(full)
        return out

    def _filter_by_query(self, items: List[Dict[str, str]], query: str) -> List[Dict[str, str]]:
        if not items:
            return []
        qslug = _slugify(query)
        qparts = [p for p in qslug.split("-") if p]
        if not qparts:
            return items
        out = []
        for it in items:
            tslug = _slugify(it.get("title", ""))
            uslug = _slugify(it.get("url", ""))
            if any(p in tslug for p in qparts) or any(p in uslug for p in qparts):
                out.append(it)
        return out

    @staticmethod
    def _dedupe(urls: List[str]) -> List[str]:
        seen, out = set(), []
        for u in urls:
            if u not in seen:
                seen.add(u)
                out.append(u)
        return out

    @staticmethod
    def _dedupe_and_limit(items: List[Dict[str, str]], limit: int) -> List[Dict[str, str]]:
        out, seen = [], set()
        for it in items:
            key = it.get("url") or it.get("id")
            if key in seen:
                continue
            seen.add(key)
            out.append(it)
            if len(out) >= limit:
                break
        return out

    @staticmethod
    def _extract_manga_id(href: str, title: str) -> str:
        slug = _slugify(title)
        h = hashlib.md5(href.encode("utf-8")).hexdigest()[:8]
        return f"{slug}-{h}"

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

    @staticmethod
    def _extract_cover(soup: BeautifulSoup) -> Optional[str]:
        c = soup.select_one("img.cover, .cover img, .series-cover img, .manga-cover img, img[alt*='cover' i]")
        if c:
            return (c.get("data-src") or c.get("src") or "").strip() or None
        return None

    def _parse_chapters(self, soup: BeautifulSoup) -> List[Chapter]:
        chapters: List[Chapter] = []

        candidates = soup.select(
            ".chapter-list a, .chapters a, .list-chapter a, "
            "table tr a, ul li a, a[href*='/read/'], a[href*='/chapter/']"
        )
        seen_urls = set()

        for a in candidates:
            href = (a.get("href") or "").strip()
            text = a.get_text(" ", strip=True)
            if not href:
                continue

            url = self._abs_url(href)
            low = url.lower()

            if not ("/read/" in low or "/chapter/" in low):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            mnum = re.search(r"(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)", text, flags=re.I)
            chap_no = mnum.group(1) if mnum else ""

            title = None
            mt = re.search(r"(?:-|–|—)\s*(.+)$", text)
            if mt:
                title = mt.group(1).strip() or None

            updated = None
            sib_text = " ".join(s.get_text(" ", strip=True) for s in a.parent.find_all("span")) if a.parent else ""
            if sib_text:
                mu = re.search(r"(\d{4}-\d{2}-\d{2}|ago|yesterday|today|\d+\s+(?:day|hour|minute)s?\s+ago)", sib_text, flags=re.I)
                updated = mu.group(1) if mu else None

            cid = hashlib.md5(url.encode("utf-8")).hexdigest()[:10]
            chapters.append(Chapter(id=cid, number=chap_no, title=title, url=url, updated=updated))

        return chapters

    def _abs_url(self, href: str) -> str:
        if href.startswith("http"):
            return href
        if not href.startswith("/"):
            href = f"/{href}"
        return f"{self.base_url}{href}"
