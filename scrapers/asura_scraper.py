from bs4 import BeautifulSoup
import httpx
import re
import json
from typing import Dict

class AsuraComic:
    def __init__(self):
        self.base_url = "https://asuracomic.net"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://asuracomic.net/",
        }

    def search(self, query: str, page: int = 1) -> Dict:
        # Return empty - we're using hardcoded manhwa for search
        return {"status": 200, "results": []}

    def info(self, series_id: str) -> Dict:
        """Scrape manga info and chapters from HTML"""
        try:
            url = f"{self.base_url}/series/{series_id}"

            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url, headers=self.headers)
                soup = BeautifulSoup(response.content, "html.parser")

                # Try to extract from __NEXT_DATA__ JSON
                script = soup.find("script", id="__NEXT_DATA__")
                if script:
                    try:
                        next_data = json.loads(script.string)
                        props = next_data.get("props", {}).get("pageProps", {})
                        comic = props.get("comic") or props.get("series") or {}

                        if comic:
                            content = {
                                "title": comic.get("name") or comic.get("title") or "",
                                "image": comic.get("thumbnail") or comic.get("cover"),
                                "description": comic.get("description") or comic.get("synopsis") or "",
                                "genres": [g.get("name", "") if isinstance(g, dict) else str(g) for g in comic.get("genres", [])],
                                "status": comic.get("status", ""),
                                "chapters": []
                            }

                            # Extract chapters from JSON
                            raw_chapters = comic.get("chapters") or props.get("chapters") or []
                            for ch in raw_chapters:
                                ch_id = str(ch.get("chapter_slug") or ch.get("id") or ch.get("number") or "")
                                ch_num = ch.get("chapter") or ch.get("number") or 0
                                content["chapters"].append({
                                    "title": f"Chapter {ch_num}",
                                    "id": ch_id,
                                    "url": f"{self.base_url}/series/{series_id}/chapter/{ch_id}",
                                })

                            return {"status": 200, "results": content}
                    except Exception as e:
                        print(f"JSON extraction failed: {e}")

                # Fallback: HTML scraping
                return {"status": "error", "results": "Could not parse manga info"}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str) -> Dict:
        """Get chapter pages from __NEXT_DATA__"""
        try:
            url = f"{self.base_url}/series/{series_id}/chapter/{chapter_id}"

            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                response = client.get(url, headers=self.headers)
                soup = BeautifulSoup(response.content, "html.parser")

                # Extract from __NEXT_DATA__
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
                        print(f"Page extraction failed: {e}")

                return {"status": "error", "results": "No pages found"}

        except Exception as e:
            return {"status": "error", "results": str(e)}
