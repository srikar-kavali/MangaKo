from __future__ import annotations
import os
import sys
import re
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.middleware.cors import CORSMiddleware

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
        url = f"{BASE}/search?{urlencode({'q': q})}"
        print("🔎 Fetching:", url)
        soup = self._soup(url)

        results: List[Dict] = []
        seen = set()

        for a in soup.select('a[href^="/manga/"]'):
            href = a.get("href", "")
            if not href or "/chapter" in href or href in seen:
                continue
            seen.add(href)

            # Try alt attribute first (Mangapill often puts title there)
            img_el = a.select_one("img")
            title = None
            cover = None

            if img_el:
                title_alt = img_el.get("alt")
                cover = img_el.get("src") or img_el.get("data-src")
                if cover:
                    cover = self._abs(cover)
            else:
                title_alt = None

            # Fallback title from visible text
            title_el = a.select_one("h3, h2, p, span")
            title_text = title_el.get_text(strip=True) if title_el else None

            # Choose whichever is longer and unique
            if title_alt and title_text:
                title = title_alt if len(title_alt) >= len(title_text) else title_text
            else:
                title = title_alt or title_text

            if not title:
                continue  # skip if no title found

            # Clean up repeated text (e.g., "One Piece")
            parts = title.split()
            half = len(parts) // 2
            if len(parts) % 2 == 0 and parts[:half] == parts[half:]:
                title = " ".join(parts[:half])

            results.append({
                "title": title.strip(),
                "url": self._abs(href),
                "cover": cover,
                "source": "mangapill",
            })

            if len(results) >= max(1, limit):
                break

        print(f"✅ Found {len(results)} results with titles")
        return results

    # ---- /manga?url=... ------------------------------------------------------
    def get_manga(self, url: str) -> Dict:
        """
        Accepts an absolute or site-relative URL to a manga page.
        Extracts title, description, tags, cover image, and the list of chapters.
        """
        if re.match(r"^https://mangapill\.com/manga/[^/]+$", url):
            # Try to find correct URL from search
            slug = url.rstrip("/").split("/")[-1]
            search_results = self.search(slug, limit=3)
            for r in search_results:
                if slug in r["url"]:
                    url = r["url"]
                    break

        soup = self._soup(url)

        # Title
        title_el = soup.select_one("h1, h2.text-2xl, h1.text-3xl")
        title = title_el.get_text(strip=True) if title_el else "Unknown"

        # Cover Image
        cover = None
        cover_img = (
                soup.select_one("img.lazy") or
                soup.select_one("img[alt*='cover']") or
                soup.select_one(".manga-cover img") or
                soup.select_one("img.rounded") or
                soup.select_one("div.container img")  # First image in container
        )
        if cover_img:
            cover = cover_img.get("data-src") or cover_img.get("src")
            if cover:
                cover = self._abs(cover)

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
            uniq.append(ch)

        return {
            "title": title,
            "description": description,
            "cover": cover,
            "tags": tags,
            "chapters": uniq or chapters,
            "source": "mangapill",
            "url": url if url.startswith("http") else self._abs(url),
        }

    # ---- /chapter_pages?url=... ----------------------------------------------
    def get_chapter_pages(self, url: str) -> List[str]:
        """
        Returns a list of image URLs for a chapter page.
        Handles both direct chapter URLs and partial ones.
        Example input:
          - https://mangapill.com/chapters/2-10003000/one-piece-chapter-3
          - https://mangapill.com/manga/2/one-piece
        """
        try:
            # --- Normalize URL ---
            url = url.strip()
            if not url.startswith("http"):
                url = f"https://mangapill.com{url}"
            url = url.rstrip("/")

            # --- Extract slug safely ---
            parts = url.split("/")
            slug = parts[-1] if parts else ""
            base_name = ""
            if "-chapter-" in slug:
                base_name = slug.split("-chapter-")[0]
            elif len(parts) >= 2:
                base_name = parts[-2]
            else:
                base_name = slug or "chapter"

            # --- Resolve to full chapter URL if not a direct chapter link ---
            if "/chapters/" not in url:
                search_results = self.search(base_name, limit=3)
                for r in search_results:
                    manga_data = self.get_manga(r["url"])
                    for ch in manga_data.get("chapters", []):
                        if slug in ch["url"]:
                            url = ch["url"]
                            break
                    if "/chapters/" in url:
                        break

            # --- Fetch and parse chapter HTML ---
            soup = self._soup(url)
            imgs: List[str] = []

            # Extract images (<img src> or lazy-loaded versions)
            for img in soup.select("img"):
                src = img.get("src") or img.get("data-src") or img.get("data-original")
                if not src:
                    continue
                if any(bad in src for bad in (".svg", "data:image")):
                    continue
                imgs.append(self._abs(src))

            # Fallback: <picture><source srcset>
            if not imgs:
                for source in soup.select("picture source"):
                    srcset = source.get("srcset")
                    if not srcset:
                        continue
                    first = srcset.split(",")[0].strip().split(" ")[0]
                    if first:
                        imgs.append(self._abs(first))

            if not imgs:
                raise ValueError(f"No images found for chapter: {url}")

            return imgs

        except Exception as e:
            print(f"[ERROR] get_chapter_pages failed for {url}: {e}")
            raise