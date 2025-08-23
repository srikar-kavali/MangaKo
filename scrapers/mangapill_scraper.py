# scrapers/mangapill_scraper.py
from __future__ import annotations
from typing import List, Dict
from urllib.parse import urljoin, urlencode, quote_plus

import httpx
from bs4 import BeautifulSoup

BASE = "https://mangapill.com"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
}

class MangapillScraper:
    def __init__(self) -> None:
        self.client = httpx.Client(
            headers=BROWSER_HEADERS,
            http2=True,
            timeout=30.0,
            follow_redirects=True,
        )

    # ---- helpers -------------------------------------------------------------
    def _abs(self, href: str) -> str:
        return urljoin(BASE, href)

    def _soup(self, url: str) -> BeautifulSoup:
        if not url.startswith("http"):
            url = self._abs(url)
        r = self.client.get(url)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")

    # ---- /search -------------------------------------------------------------
    def search(self, q: str, limit: int = 20) -> List[Dict]:
        """
        Scrapes Mangapill search results. Current site uses /search?q=...
        Cards link to /manga/<id>/<slug> (id now appears first).
        """
        url = f"{BASE}/search?{urlencode({'q': q})}"
        soup = self._soup(url)

        results: List[Dict] = []

        # Primary selector: result cards
        # Typical structure:
        #   <a href="/manga/3258/one-piece-digital-colored-comics" ...>
        #     <div>...<h3>Title</h3>...<p>Author/desc</p>...</div>
        #   </a>
        for a in soup.select('a[href^="/manga/"]'):
            href = a.get("href", "")
            # Avoid nav links that aren't cards
            if not href or "/chapter" in href:
                continue

            title_el = a.select_one("h3, h2, .line-clamp-2, .text-base, .text-lg")
            title = (title_el.get_text(strip=True) if title_el else a.get_text(strip=True)) or "Unknown"

            img_el = a.select_one("img")
            cover = None
            if img_el:
                cover = img_el.get("src") or img_el.get("data-src")
                if cover:
                    cover = self._abs(cover)

            results.append({
                "title": title,
                "url": self._abs(href),
                "cover": cover,
                "source": "mangapill",
            })
            if len(results) >= max(1, limit):
                break

        return results

    # ---- /manga?url=... ------------------------------------------------------
    def get_manga(self, url: str) -> Dict:
        """
        Accepts an absolute or site-relative URL to a manga page.
        Extracts title, description, tags, and the list of chapters.
        """
        soup = self._soup(url)

        # Title
        title_el = soup.select_one("h1, h2.text-2xl, h1.text-3xl")
        title = title_el.get_text(strip=True) if title_el else "Unknown"

        # Description
        desc_el = soup.select_one("div.prose, .prose p, #description, article p")
        description = desc_el.get_text(" ", strip=True) if desc_el else None

        # Tags
        tags = [t.get_text(strip=True) for t in soup.select("a[href*='/genres'], .badge, .tag, .chip")]

        # Chapters (new structure has ids like /chapters/8287-10001000/<slug> or similar)
        chapters = []
        for a in soup.select('a[href^="/chapters/"]'):
            ch_href = a.get("href")
            if not ch_href:
                continue
            name = a.get_text(strip=True)
            chapters.append({
                "name": name,
                "url": self._abs(ch_href),
            })

        # De-dup & order (best effort)
        seen = set()
        uniq = []
        for ch in chapters:
            if ch["url"] in seen:
                continue
            seen.add(ch["url"])
            uniq.append(ch)  # Fixed: removed invalid walrus operator syntax

        return {
            "title": title,
            "description": description,
            "tags": tags,
            "chapters": uniq or chapters,
            "source": "mangapill",
            "url": url if url.startswith("http") else self._abs(url),
        }

    # ---- /chapter_pages?url=... ----------------------------------------------
    def get_chapter_pages(self, url: str) -> List[str]:
        """
        Returns a list of image URLs for a chapter page.
        Images may be in <img src> or <img data-src>.
        """
        soup = self._soup(url)

        imgs: List[str] = []
        for img in soup.select("img"):
            src = img.get("src") or img.get("data-src") or img.get("data-original")
            if not src:
                continue
            # Skip icons/sprites
            if any(bad in src for bad in (".svg", "data:image")):
                continue
            imgs.append(self._abs(src))

        # Best-effort fallback: sometimes images are inside <picture><source srcset=...>
        if not imgs:
            for source in soup.select("picture source"):
                srcset = source.get("srcset")
                if not srcset:
                    continue
                # Pick the first URL in srcset
                first = srcset.split(",")[0].strip().split(" ")[0]
                if first:
                    imgs.append(self._abs(first))

        return imgs