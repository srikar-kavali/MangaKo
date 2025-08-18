from __future__ import annotations

import re
import hashlib
from dataclasses import dataclass
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException

BASE_URL = "https://weebcentral.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WeebCentralScraper/1.0)"
}
REQ_TIMEOUT = 20


def _get(url: str, params: Optional[dict] = None) -> requests.Response:
    resp = requests.get(url, params=params, headers=HEADERS, timeout=REQ_TIMEOUT)
    resp.raise_for_status()
    return resp


def _slugify(s: str) -> str:
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


class WeebCentralScraper:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url.rstrip("/")

    def search(self, query: str, limit: int = 20) -> List[Dict[str, str]]:
        q = query.strip()
        if not q:
            return []

        url = f"{self.base_url}/search"
        params_list = [{"keyword": q}, {"q": q}]
        last_err: Optional[Exception] = None

        for params in params_list:
            try:
                resp = _get(url, params=params)
                soup = BeautifulSoup(resp.text, "html.parser")
                results: List[Dict[str, str]] = []

                # generous selectors across clones
                for a in soup.select("a.series, a.manga, a[href*='/manga/']"):
                    title = (a.get("title") or a.get_text(strip=True) or "").strip()
                    href = (a.get("href") or "").strip()
                    if not title or not href:
                        continue
                    href = self._abs_url(href)
                    mid = self._extract_manga_id(href, title)
                    results.append({"id": mid, "title": title, "url": href})
                    if len(results) >= limit:
                        break
                if results:
                    return results
            except RequestException as e:
                last_err = e

        if last_err:
            raise last_err
        return []

    def get_manga(self, manga_url_or_id: str) -> Manga:
        url = manga_url_or_id
        if not url.startswith("http"):
            url = f"{self.base_url}/manga/{manga_url_or_id}"

        resp = _get(url)
        soup = BeautifulSoup(resp.text, "html.parser")

        title_el = soup.select_one("h1, h2.title, .series-title, .manga-title")
        title = (title_el.get_text(strip=True) if title_el else "Unknown").strip()

        description = None
        desc_el = soup.select_one(
            ".description, #description, .manga-description, .series-desc, .summary"
        )
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

    def get_chapter_pages(self, chapter_url_or_id: str) -> List[str]:
        url = chapter_url_or_id
        if not url.startswith("http"):
            url = f"{self.base_url}/read/{chapter_url_or_id}"

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
                if found:
                    imgs.extend(found)

        seen = set()
        deduped = []
        for u in imgs:
            if u not in seen:
                seen.add(u)
                deduped.append(u)
        return deduped

    @staticmethod
    def _extract_manga_id(href: str, title: str) -> str:
        slug = _slugify(title)
        h = hashlib.md5(href.encode("utf-8")).hexdigest()[:8]
        return f"{slug}-{h}"

    @staticmethod
    def _extract_list_after_label(soup: BeautifulSoup, labels: List[str], limit: int = 10) -> List[str]:
        results: List[str] = []
        for label in labels:
            els = soup.find_all(string=re.compile(rf"^{label}\s*:", re.I))
            for el in els:
                parent = getattr(el, "parent", None)
                if not parent:
                    continue
                for a in parent.find_all("a"):
                    t = a.get_text(strip=True)
                    if t and t not in results:
                        results.append(t)
        return results[:limit]

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
        c = soup.select_one(
            "img.cover, .cover img, .series-cover img, .manga-cover img, img[alt*='cover' i]"
        )
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

            if not ("/read/" in url or "/chapter/" in url):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            number_match = re.search(r"(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)", text, flags=re.I)
            chap_no = number_match.group(1) if number_match else ""

            title = None
            title_match = re.search(r"(?:-|–|—)\s*(.+)$", text)
            if title_match:
                title = title_match.group(1).strip() or None

            updated = None
            sib_text = " ".join(s.get_text(" ", strip=True) for s in a.parent.find_all("span")) if a.parent else ""
            if sib_text:
                m = re.search(r"(\d{4}-\d{2}-\d{2}|ago|yesterday|today|\d+\s+(?:day|hour|minute)s?\s+ago)", sib_text, flags=re.I)
                updated = m.group(1) if m else None

            cid = hashlib.md5(url.encode("utf-8")).hexdigest()[:10]
            chapters.append(Chapter(id=cid, number=chap_no, title=title, url=url, updated=updated))

        return chapters

    def _abs_url(self, href: str) -> str:
        if href.startswith("http"):
            return href
        if not href.startswith("/"):
            href = f"/{href}"
        return f"{self.base_url}{href}"
