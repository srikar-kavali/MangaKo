from bs4 import BeautifulSoup
import requests
from typing import List, Dict
import re

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

            # Find all links - both with and without leading slash
            # Pattern: href contains "series/" but NOT "/series/" and not external links
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')

                # Skip if empty or already seen
                if not href or href in seen_urls:
                    continue

                # Match patterns like: "series/manga-name-123" or "/series/manga-name-123"
                # But skip chapters, external links, and navigation
                if ('series/' in href and
                        'chapter' not in href.lower() and
                        not any(skip in href for skip in ['facebook', 'twitter', 'whatsapp', 'pinterest', 'mailto:', 'tel:']) and
                        not href.startswith('http://') and
                        not href.startswith('https://') and
                        href != '/series' and
                        '?page=' not in href):

                    # Normalize URL
                    if href.startswith('/'):
                        full_url = f"{self.base_url}{href}"
                    elif href.startswith('series/'):
                        full_url = f"{self.base_url}/{href}"
                    else:
                        continue

                    if full_url in seen_urls:
                        continue

                    # Extract series ID from URL
                    # Format: series/manga-name-id or /series/manga-name-id
                    match = re.search(r'series/([^/?#]+)', href)
                    if not match:
                        continue

                    series_id = match.group(1)

                    # Get title - try link text first, then nearby elements
                    title = link.get_text(strip=True)

                    # If title is empty or very short, look at parent elements
                    if not title or len(title) < 2:
                        parent = link.parent
                        if parent:
                            title = parent.get_text(strip=True)

                    # Clean up title
                    if title and 'Chapter' in title:
                        # Remove chapter info
                        title = re.sub(r'(Ongoing|Completed|Hiatus)?.*?Chapter.*$', '', title, flags=re.IGNORECASE)
                        title = title.strip()

                    # Skip if still no good title
                    if not title or len(title) < 2:
                        continue

                    # Try to find associated image
                    image = None

                    # Look for img in the link itself first (most common)
                    img_tag = link.find('img')

                    # If not found, check parent and grandparent
                    if not img_tag:
                        parent = link.parent
                        if parent:
                            img_tag = parent.find('img')
                            if not img_tag and parent.parent:
                                img_tag = parent.parent.find('img')

                    if img_tag:
                        image = img_tag.get('src') or img_tag.get('data-src') or img_tag.get('data-original')
                        # Make image URL absolute if needed
                        if image:
                            if not image.startswith('http'):
                                if image.startswith('/'):
                                    image = f"{self.base_url}{image}"
                                else:
                                    image = f"{self.base_url}/{image}"
                        else:
                            image = None

                    seen_urls.add(full_url)
                    content.append({
                        "title": title,
                        "id": series_id,
                        "url": full_url,
                        "image": image,
                        "latest_chapter": None
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

            # Cover image
            cover = soup.select_one("img[alt='poster'], img[alt*='cover'], div[class*='poster'] img, div[class*='cover'] img")
            if cover:
                content["image"] = cover.get('src') or cover.get('data-src')
                if content["image"] and not content["image"].startswith('http'):
                    content["image"] = f"{self.base_url}/{content['image'].lstrip('/')}"
            else:
                content["image"] = None

            # Title
            title_tag = soup.select_one("h1, h2, h3[class*='title']")
            content["title"] = title_tag.get_text(strip=True) if title_tag else series_id.replace('-', ' ').title()

            # Description
            desc_selectors = [
                "div[class*='description'] p",
                "div[class*='summary'] p",
                "div.space-y-4 p",
                "p.text-sm",
                ".prose p"
            ]
            description = None
            for selector in desc_selectors:
                desc_tag = soup.select_one(selector)
                if desc_tag:
                    description = desc_tag.get_text(strip=True)
                    if len(description) > 50:
                        break
            content["description"] = description or "No description available."

            # Genres
            genres = []
            for tag in soup.select("a[href*='genre'], span.badge, span.tag, .genre-tag, a[href*='genres']"):
                genre_text = tag.get_text(strip=True)
                if genre_text and len(genre_text) < 30:
                    genres.append(genre_text)
            content["genres"] = list(set(genres))

            # Additional info (status, type, etc.)
            for detail in soup.select("div[class*='detail'] div, div[class*='info'] div"):
                text = detail.get_text(strip=True)
                if ':' in text:
                    label, value = text.split(':', 1)
                    content[label.strip().lower()] = value.strip()

            # Chapters - look for links with 'chapter' in href
            chapters = []
            seen_chapters = set()

            for link in soup.find_all('a', href=True):
                href = link.get('href')

                # Match chapter links: series/{id}/chapter/{chapter_id} or chapter/{chapter_id}
                if not href or 'chapter' not in href.lower():
                    continue

                if href in seen_chapters:
                    continue

                # Extract chapter info
                chapter_match = re.search(r'chapter[/-]([^/?#]+)', href, re.IGNORECASE)
                if not chapter_match:
                    continue

                chapter_id = chapter_match.group(1)
                chapter_title = link.get_text(strip=True)

                # Make URL absolute
                if href.startswith('/'):
                    full_href = f"{self.base_url}{href}"
                elif href.startswith('http'):
                    full_href = href
                else:
                    full_href = f"{self.base_url}/{href}"

                seen_chapters.add(href)

                # Look for date
                date = None
                parent = link.parent
                if parent:
                    date_elem = parent.find('time') or parent.find('span', class_=lambda x: x and 'date' in str(x).lower())
                    if date_elem:
                        date = date_elem.get_text(strip=True)

                chapters.append({
                    "title": chapter_title,
                    "id": chapter_id,
                    "url": full_href,
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

            pages = []

            # Look for reader images with various selectors
            img_selectors = [
                "img.reader-image",
                "img[class*='reader']",
                "img[alt*='page']",
                "div[class*='reader'] img",
                "div[class*='chapter'] img",
                "main img"
            ]

            for selector in img_selectors:
                imgs = soup.select(selector)
                for img in imgs:
                    src = img.get('src') or img.get('data-src') or img.get('data-original')
                    if src and not any(skip in src.lower() for skip in ['.svg', 'data:image', 'logo', 'icon', 'avatar']):
                        # Make URL absolute
                        if not src.startswith('http'):
                            src = f"{self.base_url}/{src.lstrip('/')}"
                        if src not in pages:
                            pages.append(src)

                if pages:  # If we found images with this selector, stop
                    break

            # Fallback: get all substantial images
            if not pages:
                all_imgs = soup.find_all('img')
                for img in all_imgs:
                    src = img.get('src') or img.get('data-src')
                    if src and src.startswith('http') and not any(skip in src.lower() for skip in ['.svg', 'logo', 'icon', 'avatar', 'banner']):
                        if src not in pages:
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
            self.results["status"] = response.status_code
            # Reuse search logic
            return self.search("", page)
        except Exception as e:
            return {"status": "error", "results": str(e)}

    def genres(self, genre_slug: str, page: int = 1) -> Dict:
        """Get series by genre"""
        try:
            url = f"{self.proxy_url}{self.base_url}/genres/{genre_slug}?page={page}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            # Reuse search logic
            return self.search("", page)
        except Exception as e:
            return {"status": "error", "results": str(e)}