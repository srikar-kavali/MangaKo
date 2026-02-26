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
            "Referer": "https://asuracomic.net/",
            "Origin": "https://asuracomic.net",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
        }
        self.client = httpx.Client(timeout=15.0, follow_redirects=True)

    def _get(self, path: str) -> httpx.Response:
        url = f"{self.proxy_url}{self.base_url}{path}"
        return self.client.get(url, headers=self.headers)

    def _extract_next_data(self, soup: BeautifulSoup) -> dict:
        script = soup.find("script", id="__NEXT_DATA__")
        if not script:
            return {}
        try:
            return json.loads(script.string)
        except Exception:
            return {}

    def search(self, query: str, page: int = 1) -> Dict:
        try:
            # Use httpx instead of requests
            api_url = f"{self.base_url}/api/series/search?name={query}"
            response = self.client.get(api_url, headers=self.headers)
            data = response.json()

            if isinstance(data, list):
                series_list = data
            elif isinstance(data, dict):
                series_list = (
                        data.get("data") or
                        data.get("results") or
                        data.get("series") or
                        []
                )
            else:
                series_list = []

            content = []
            for s in series_list:
                slug = s.get("series_slug") or s.get("slug") or s.get("id", "")
                title = s.get("title") or s.get("name") or slug.replace("-", " ").title()
                image = (
                        s.get("thumbnail") or
                        s.get("cover") or
                        s.get("image") or
                        s.get("thumb")
                )
                latest = s.get("latestChapter") or s.get("latest_chapter")
                content.append({
                    "title": title,
                    "id": slug,
                    "url": f"{self.base_url}/series/{slug}",
                    "image": image,
                    "latest_chapter": latest,
                })

            return {"status": response.status_code, "results": content}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def info(self, series_id: str) -> Dict:
        try:
            response = self._get(f"/series/{series_id}")
            soup = BeautifulSoup(response.content, "html.parser")

            next_data = self._extract_next_data(soup)
            content = {}

            try:
                props = next_data.get("props", {}).get("pageProps", {})
                comic = (
                        props.get("comic") or
                        props.get("series") or
                        props.get("data") or
                        {}
                )

                if comic:
                    content["title"] = comic.get("name") or comic.get("title") or ""
                    content["image"] = comic.get("thumbnail") or comic.get("cover") or comic.get("image")
                    content["description"] = comic.get("description") or comic.get("synopsis") or ""
                    content["genres"] = [
                        g.get("name") or g if isinstance(g, str) else g.get("name", "")
                        for g in (comic.get("genres") or [])
                    ]
                    content["status"] = comic.get("status", "")

                    raw_chapters = (
                            comic.get("chapters") or
                            props.get("chapters") or
                            []
                    )
                    chapters = []
                    for ch in raw_chapters:
                        ch_id = str(ch.get("chapter_slug") or ch.get("id") or ch.get("number") or "")
                        ch_num = ch.get("chapter") or ch.get("number") or 0
                        chapters.append({
                            "title": f"Chapter {ch_num}",
                            "id": ch_id,
                            "url": f"{self.base_url}/series/{series_id}/chapter/{ch_id}",
                            "date": ch.get("created_at") or ch.get("date") or "",
                        })
                    content["chapters"] = chapters

                    if content.get("title"):
                        return {"status": response.status_code, "results": content}
            except Exception:
                pass

            # HTML fallback (same as before)
            cover = (
                    soup.select_one("img[alt='poster']") or
                    soup.select_one("div[class*='poster'] img") or
                    soup.select_one("div[class*='relative'][class*='overflow'] img") or
                    soup.select_one("img[src*='gg.asuracomic.net']")
            )
            content["image"] = None
            if cover:
                src = cover.get("src") or cover.get("data-src")
                if src and not src.startswith("http"):
                    src = f"{self.base_url}/{src.lstrip('/')}"
                content["image"] = src

            h1 = soup.select_one("h1")
            content["title"] = h1.get_text(strip=True) if h1 else series_id.replace("-", " ").title()

            content["description"] = "No description available."
            for sel in ["div[class*='desc'] p", "div[class*='summary'] p", "p.text-sm"]:
                el = soup.select_one(sel)
                if el and len(el.get_text(strip=True)) > 50:
                    content["description"] = el.get_text(strip=True)
                    break

            content["genres"] = list({
                a.get_text(strip=True)
                for a in soup.select("a[href*='genre'], a[href*='genres']")
                if a.get_text(strip=True)
            })

            chapters = []
            seen_ch = set()

            for a in soup.find_all("a", href=re.compile(r"/series/.+/chapter/")):
                href = a.get("href", "")
                if href in seen_ch:
                    continue
                seen_ch.add(href)

                ch_match = re.search(r"/chapter/([^/?#]+)", href)
                if not ch_match:
                    continue
                ch_id = ch_match.group(1)

                spans = a.find_all(["span", "p"], recursive=False)
                if spans:
                    ch_title = spans[0].get_text(strip=True)
                    ch_date = spans[1].get_text(strip=True) if len(spans) > 1 else ""
                else:
                    full_text = a.get_text(strip=True)
                    date_match = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+", full_text)
                    if date_match:
                        ch_title = full_text[:date_match.start()].strip()
                        ch_date = full_text[date_match.start():].strip()
                    else:
                        ch_title = full_text
                        ch_date = ""

                full_url = f"{self.base_url}{href}" if href.startswith("/") else href

                chapters.append({
                    "title": ch_title,
                    "id": ch_id,
                    "url": full_url,
                    "date": ch_date,
                })

            content["chapters"] = chapters
            return {"status": response.status_code, "results": content}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str) -> Dict:
        try:
            response = self._get(f"/series/{series_id}/chapter/{chapter_id}")
            soup = BeautifulSoup(response.content, "html.parser")

            next_data = self._extract_next_data(soup)
            pages = []

            try:
                props = next_data.get("props", {}).get("pageProps", {})
                chapter = (
                        props.get("chapter") or
                        props.get("data") or
                        {}
                )

                images = (
                        chapter.get("images") or
                        chapter.get("pages") or
                        chapter.get("chapter_images") or
                        []
                )

                for img in images:
                    if isinstance(img, str):
                        pages.append(img)
                    elif isinstance(img, dict):
                        src = img.get("url") or img.get("src") or img.get("image")
                        if src:
                            pages.append(src)

                if pages:
                    return {"status": response.status_code, "results": pages}

                all_text = json.dumps(next_data)
                found = re.findall(r'https://[^"\'\\]+gg\.asuracomic\.net[^"\'\\]+\.(?:jpg|jpeg|png|webp)', all_text)
                if found:
                    seen = set()
                    for url in found:
                        if url not in seen:
                            seen.add(url)
                            pages.append(url)
                    return {"status": response.status_code, "results": pages}

            except Exception:
                pass

            for img in soup.find_all("img"):
                src = img.get("src") or img.get("data-src")
                if not src:
                    continue
                if "gg.asuracomic.net" in src or f"{self.base_url}" in src:
                    if any(skip in src.lower() for skip in ["logo", "icon", "avatar", "banner", "thumbnail"]):
                        continue
                    if src not in pages:
                        pages.append(src)

            return {"status": response.status_code, "results": pages}

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def latest(self, page: int = 1) -> Dict:
        try:
            response = self._get(f"/series?page={page}&order=update")
            soup = BeautifulSoup(response.content, "html.parser")
            next_data = self._extract_next_data(soup)
            return self.search("", page)
        except Exception as e:
            return {"status": "error", "results": str(e)}

    def genres(self, genre_slug: str, page: int = 1) -> Dict:
        try:
            return self.search("", page)
        except Exception as e:
            return {"status": "error", "results": str(e)}
