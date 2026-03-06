from bs4 import BeautifulSoup
import httpx
import re
import json
from typing import Dict

class AsuraComic:
    def __init__(self):
        self.proxy_url = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
        self.base_url = "https://asuracomic.net"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }

    def _get(self, url: str) -> bytes:
        proxied = f"{self.proxy_url}{url}"
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
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
                                props.get("chapters") or
                                []
                        )
                        for ch in raw_chapters:
                            ch_id = str(
                                ch.get("chapter_slug") or
                                ch.get("id") or
                                ch.get("number") or ""
                            )
                            ch_num = ch.get("chapter") or ch.get("number") or 0
                            result["chapters"].append({
                                "title": f"Chapter {ch_num}",
                                "id": ch_id,
                                "url": f"{self.base_url}/series/{series_id}/chapter/{ch_id}",
                            })

                        if result["title"] or result["chapters"]:
                            return {"status": 200, "results": result}
                except Exception as e:
                    print(f"__NEXT_DATA__ failed: {e}")

            # Fallback: HTML scraping
            result = {
                "title": "",
                "image": "",
                "description": "",
                "genres": [],
                "status": "",
                "chapters": []
            }

            # Title
            title_el = soup.select_one("span.text-xl.font-bold") or soup.select_one("h1")
            if title_el:
                result["title"] = title_el.get_text(strip=True)

            # Cover image
            img_el = soup.select_one("img.rounded") or soup.select_one("div.thumb img")
            if img_el:
                result["image"] = img_el.get("src") or img_el.get("data-src") or ""

            # Description
            desc_el = soup.select_one("div.col-span-12.mt-3 p") or soup.select_one("div.entry-content p")
            if desc_el:
                result["description"] = desc_el.get_text(strip=True)

            # Genres
            genre_els = soup.select("div.genres a") or soup.select("a[href*='/genres/']")
            result["genres"] = [g.get_text(strip=True) for g in genre_els]

            # Chapters — asuracomic.net chapter list
            chapter_els = soup.select("div.scrollbar-thumb-themecolor a[href*='/chapter/']")
            for el in chapter_els:
                href = el.get("href", "")
                ch_id = href.rstrip("/").split("/")[-1]
                ch_title = el.get_text(strip=True) or f"Chapter {ch_id}"
                result["chapters"].append({
                    "title": ch_title,
                    "id": ch_id,
                    "url": f"{self.base_url}{href}" if href.startswith("/") else href,
                })

            return {"status": 200, "results": result}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str) -> Dict:
        try:
            url = f"{self.base_url}/series/{series_id}/chapter/{chapter_id}"
            content = self._get(url)
            soup = BeautifulSoup(content, "html.parser")

            # Try __NEXT_DATA__
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
                        return {"status": 200, "results": pages}
                except Exception as e:
                    print(f"Pages __NEXT_DATA__ failed: {e}")

            # Fallback: scrape image tags in reader area
            imgs = soup.select("div#readerarea img") or soup.select("img[loading='lazy']")
            pages = []
            for img in imgs:
                src = img.get("src") or img.get("data-src") or ""
                if src and ("storage" in src or "cdn" in src or "asura" in src):
                    pages.append(src)

            if pages:
                return {"status": 200, "results": pages}

            return {"status": "error", "results": "No pages found"}

        except Exception as e:
            return {"status": "error", "results": str(e)}