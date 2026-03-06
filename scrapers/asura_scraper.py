from bs4 import BeautifulSoup
import httpx
import json
from typing import Dict

class AsuraComic:
    def __init__(self):
        self.proxy_url = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
        self.base_url = "https://asuracomic.net"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://asuracomic.net/",
        }

    def _get(self, url: str) -> bytes:
        """Always fetch through proxy to avoid blocks"""
        proxied = f"{self.proxy_url}{url}"
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            r = client.get(proxied, headers=self.headers)
            return r.content

    def search(self, query: str, page: int = 1) -> Dict:
        return {"status": 200, "results": []}

    def info(self, series_id: str) -> Dict:
        try:
            url = f"{self.base_url}/series/{series_id}"
            content = self._get(url)
            soup = BeautifulSoup(content, "html.parser")

            # Try __NEXT_DATA__ first
            script = soup.find("script", id="__NEXT_DATA__")
            if script:
                try:
                    next_data = json.loads(script.string)
                    props = next_data.get("props", {}).get("pageProps", {})
                    comic = props.get("comic") or props.get("series") or {}

                    if comic:
                        result = {
                            "title": comic.get("name") or comic.get("title") or "",
                            "image": comic.get("thumbnail") or comic.get("cover") or "",
                            "description": comic.get("description") or comic.get("synopsis") or "",
                            "genres": [
                                g.get("name", "") if isinstance(g, dict) else str(g)
                                for g in comic.get("genres", [])
                            ],
                            "status": comic.get("status", ""),
                            "chapters": []
                        }

                        raw_chapters = (
                                comic.get("chapters") or
                                props.get("chapters") or []
                        )
                        for ch in raw_chapters:
                            # Get the clean numeric/slug chapter id
                            ch_slug = str(
                                ch.get("chapter_slug") or
                                ch.get("id") or
                                ch.get("number") or ""
                            )
                            ch_num = ch.get("chapter") or ch.get("number") or 0
                            result["chapters"].append({
                                "title": f"Chapter {ch_num}",
                                "id": ch_slug,
                                "url": f"{self.base_url}/series/{series_id}/chapter/{ch_slug}",
                            })

                        if result["title"] or result["chapters"]:
                            return {"status": 200, "results": result}
                except Exception as e:
                    print(f"__NEXT_DATA__ parse failed: {e}")

            # Fallback HTML scraping
            result = {
                "title": "",
                "image": "",
                "description": "",
                "genres": [],
                "status": "",
                "chapters": []
            }

            title_el = (
                    soup.select_one("span.text-xl.font-bold") or
                    soup.select_one("h1") or
                    soup.select_one("title")
            )
            if title_el:
                result["title"] = title_el.get_text(strip=True)

            img_el = soup.select_one("img.rounded") or soup.select_one("div.thumb img")
            if img_el:
                result["image"] = img_el.get("src") or img_el.get("data-src") or ""

            desc_el = soup.select_one("div.col-span-12.mt-3 p") or soup.select_one("div.entry-content p")
            if desc_el:
                result["description"] = desc_el.get_text(strip=True)

            # Chapters — extract from links like /series/{id}/chapter/123
            import re
            chapter_links = soup.select(f"a[href*='/series/{series_id}/chapter/']")
            seen = set()
            for el in chapter_links:
                href = el.get("href", "")
                # Extract just the chapter slug from the end of the URL
                match = re.search(r'/chapter/([^/?#]+)', href)
                if not match:
                    continue
                ch_slug = match.group(1)
                if ch_slug in seen:
                    continue
                seen.add(ch_slug)
                ch_title = el.get_text(strip=True) or f"Chapter {ch_slug}"
                result["chapters"].append({
                    "title": ch_title,
                    "id": ch_slug,
                    "url": f"{self.base_url}/series/{series_id}/chapter/{ch_slug}",
                })

            return {"status": 200, "results": result}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str) -> Dict:
        try:
            # Clean chapter_id — strip any leading "chapter-" prefix if doubled
            import re
            clean_id = re.sub(r'^chapter-', '', str(chapter_id))

            url = f"{self.base_url}/series/{series_id}/chapter/{clean_id}"
            print(f"Fetching chapter pages from: {url}")

            content = self._get(url)
            soup = BeautifulSoup(content, "html.parser")

            # Try __NEXT_DATA__ first
            script = soup.find("script", id="__NEXT_DATA__")
            if script:
                try:
                    next_data = json.loads(script.string)
                    props = next_data.get("props", {}).get("pageProps", {})
                    chapter = props.get("chapter") or {}

                    images = chapter.get("images") or chapter.get("pages") or []
                    pages = []
                    for img in images:
                        if isinstance(img, str):
                            pages.append(img)
                        elif isinstance(img, dict):
                            src = img.get("url") or img.get("src") or img.get("image")
                            if src:
                                pages.append(src)

                    if pages:
                        print(f"Found {len(pages)} pages from __NEXT_DATA__")
                        return {"status": 200, "results": pages}
                except Exception as e:
                    print(f"Pages __NEXT_DATA__ failed: {e}")

            # Fallback: look for reader images
            # Only grab images that look like actual chapter pages (from storage/cdn)
            imgs = (
                    soup.select("div#readerarea img") or
                    soup.select("img[loading='lazy']") or
                    soup.select("div.reading-content img")
            )
            pages = []
            for img in imgs:
                src = img.get("src") or img.get("data-src") or ""
                # Filter: must be an actual page image, not a logo/icon
                if src and any(x in src for x in ["storage", "cdn", "asura", "gg."]):
                    if not any(x in src for x in ["logo", "icon", "avatar"]):
                        pages.append(src)

            if pages:
                print(f"Found {len(pages)} pages from HTML fallback")
                return {"status": 200, "results": pages}

            print("No pages found at all")
            return {"status": "error", "results": "No pages found"}

        except Exception as e:
            return {"status": "error", "results": str(e)}
