from bs4 import BeautifulSoup
import requests
from typing import List, Dict

class AsuraComic:
    def __init__(self):
        self.proxy_url = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
        self.base_url = "https://asuracomic.net"
        self.results = {
            "status": "",
            "results": []
        }

    def search(self, query: str, page: int = 1) -> Dict:
        """Search for manga by name"""
        try:
            url = f"{self.proxy_url}{self.base_url}/series?page={page}&name={query}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            content = []
            seen_urls = set()

            # Find all links to /series/ pages
            for link in soup.find_all('a', href=lambda x: x and '/series/' in x and not any(skip in x for skip in ['facebook', 'twitter', 'whatsapp', 'pinterest', 'http'])):
                href = link.get('href')

                # Skip duplicates and non-series links
                if not href or href in seen_urls or '/chapter' in href:
                    continue

                # Extract title from the link text
                title = link.get_text(strip=True)

                # Skip if no meaningful title
                if not title or len(title) < 2:
                    continue

                # Clean up title (remove chapter info if present)
                if 'Chapter' in title:
                    # Format: "OngoingSolo Max-Level NewbieChapter2329.5"
                    # Extract just the title part
                    import re
                    match = re.search(r'(Ongoing|Completed)?(.*?)Chapter', title)
                    if match:
                        title = match.group(2).strip()
                    else:
                        # Fallback: take everything before "Chapter"
                        title = title.split('Chapter')[0]
                        title = title.replace('Ongoing', '').replace('Completed', '').strip()

                # Try to find associated image
                image = None
                parent = link.parent
                if parent:
                    # Look for img in parent or nearby siblings
                    img_tag = parent.find('img')
                    if not img_tag and parent.parent:
                        img_tag = parent.parent.find('img')
                    if img_tag:
                        image = img_tag.get('src') or img_tag.get('data-src')

                # Extract ID from URL
                series_id = href.split('/')[-1] if '/' in href else href

                full_url = self.base_url + href if not href.startswith('http') else href

                if full_url not in seen_urls and title:
                    seen_urls.add(full_url)
                    content.append({
                        "title": title,
                        "id": series_id,
                        "url": full_url,
                        "image": image,
                        "latest_chapter": None  # Not easily available in new layout
                    })

            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def info(self, series_id: str) -> Dict:
        """Get detailed info about a manga series"""
        try:
            url = f"{self.proxy_url}{self.base_url}/series/{series_id}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            content = {}

            # Cover image - look for poster image
            cover = soup.select_one("img[alt='poster']")
            content["image"] = cover.get('src') or cover.get('data-src') if cover else None

            # Title - look in h1 or h2
            title_tag = soup.select_one("h1, h2")
            content["title"] = title_tag.get_text(strip=True) if title_tag else series_id

            # Description - multiple possible locations
            desc_selectors = [
                "div.space-y-4 p",  # Common pattern
                "p.text-sm",
                "div[class*='space-y'] p",
                ".prose p"
            ]
            description = None
            for selector in desc_selectors:
                desc_tag = soup.select_one(selector)
                if desc_tag:
                    description = desc_tag.get_text(strip=True)
                    if len(description) > 50:  # Make sure it's substantial
                        break
            content["description"] = description or "No description available."

            # Genres/Tags - look for genre links or badges
            genres = []
            for tag in soup.select("a[href*='genre'], span.badge, span.tag, .genre-tag"):
                genre_text = tag.get_text(strip=True)
                if genre_text and len(genre_text) < 30:  # Reasonable genre length
                    genres.append(genre_text)
            content["genres"] = list(set(genres))  # Remove duplicates

            # Status, Type, etc. - look for detail items
            for detail in soup.select("div[class*='space-y'] > div"):
                text = detail.get_text(strip=True)
                if ':' in text:
                    label, value = text.split(':', 1)
                    content[label.strip().lower()] = value.strip()

            # Chapters - look for chapter links
            chapters = []
            seen_chapters = set()

            for link in soup.find_all('a', href=lambda x: x and '/chapter/' in x):
                href = link.get('href')
                if not href or href in seen_chapters:
                    continue

                seen_chapters.add(href)
                chapter_title = link.get_text(strip=True)

                # Extract chapter ID from URL
                # Format: /series/{series_id}/chapter/{chapter_id}
                parts = href.split('/')
                chapter_id = parts[-1] if parts else None

                # Look for date in parent or sibling elements
                date = None
                parent = link.parent
                if parent:
                    date_elem = parent.find('span', class_=lambda x: x and 'date' in str(x).lower())
                    if not date_elem:
                        date_elem = parent.find('time')
                    if date_elem:
                        date = date_elem.get_text(strip=True)

                chapters.append({
                    "title": chapter_title,
                    "id": chapter_id,
                    "url": self.base_url + href if not href.startswith('http') else href,
                    "date": date
                })

            content["chapters"] = chapters
            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str) -> Dict:
        """Get all page images for a chapter"""
        try:
            url = f"{self.proxy_url}{self.base_url}/series/{series_id}/chapter/{chapter_id}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            # Look for reader images
            imgs = soup.select("img.reader-image, img[class*='reader'], img[alt*='page'], div[class*='reader'] img")

            pages = []
            for img in imgs:
                src = img.get('src') or img.get('data-src') or img.get('data-original')
                if src and not any(skip in src for skip in ['.svg', 'data:image', 'logo', 'icon']):
                    pages.append(src)

            # Fallback: get all images if specific selectors don't work
            if not pages:
                all_imgs = soup.find_all('img')
                for img in all_imgs:
                    src = img.get('src') or img.get('data-src')
                    if src and src.startswith('http') and not any(skip in src for skip in ['.svg', 'logo', 'icon', 'avatar']):
                        pages.append(src)

            self.results["results"] = pages
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def latest(self, page: int = 1) -> Dict:
        """Get latest updated series"""
        try:
            url = f"{self.proxy_url}{self.base_url}/series?page={page}&order=update"
            response = requests.get(url, timeout=15)
            return self.search("", page)  # Reuse search logic

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def genres(self, genre_slug: str, page: int = 1) -> Dict:
        """Get series by genre"""
        try:
            url = f"{self.proxy_url}{self.base_url}/genres/{genre_slug}?page={page}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            # Reuse search parsing logic
            return self.search("", page)  # This will parse the grid layout

        except Exception as e:
            return {"status": "error", "results": str(e)}