from bs4 import BeautifulSoup
import requests

class AsuraComic:
    def __init__(self):
        self.proxy_url = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
        self.base_url = "https://asuracomic.net"
        self.results = {
            "status": "",
            "results": []
        }

    def search(self, query: str, page: int = 1):
        try:
            url = f"{self.proxy_url}{self.base_url}/series?page={page}&name={query}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            cards = soup.select("div.series-card")
            content = []

            for card in cards:
                a_tag = card.find("a")
                title = card.find("h3").get_text(strip=True)
                href = a_tag.get("href")
                image = card.find("img")["src"]
                latest = card.select_one(".chapter-link").get_text(strip=True) if card.select_one(".chapter-link") else "N/A"

                tempContent = {
                    "title": title,
                    "id": href.split("/")[-1],
                    "url": self.base_url + href,
                    "image": image,
                    "latest_chapter": latest
                }
                content.append(tempContent)

            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def info(self, series_id: str):
        try:
            url = f"{self.proxy_url}{self.base_url}/series/{series_id}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            content = {}

            # Cover image
            cover = soup.select_one("img.series-thumb")
            content["image"] = cover["src"] if cover else None

            # Description
            desc_tag = soup.select_one("div.series-summary > p")
            content["description"] = desc_tag.get_text(strip=True) if desc_tag else "No description available."

            # Info table (status, type, year, author, artist, serialization)
            info_table = soup.select("div.series-details > div.detail-item")
            for info in info_table:
                label = info.find("span", class_="detail-label").get_text(strip=True)
                value = info.find("span", class_="detail-value").get_text(strip=True)
                content[label.lower()] = value

            # Genres
            genres = [g.get_text(strip=True) for g in soup.select("div.series-genres a")]
            content["genres"] = genres

            # Chapters
            chapters = []
            for li in soup.select("ul.chapter-list li"):
                a_tag = li.find("a")
                if not a_tag:
                    continue
                chapter_title = a_tag.get_text(strip=True)
                href = a_tag.get("href")
                chapter_id = href.split("/")[-1]
                date = li.select_one("span.chapter-date").get_text(strip=True) if li.select_one("span.chapter-date") else None

                chapters.append({
                    "title": chapter_title,
                    "id": chapter_id,
                    "url": self.base_url + href,
                    "date": date
                })

            content["chapters"] = chapters
            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def pages(self, series_id: str, chapter_id: str):
        try:
            url = f"{self.proxy_url}{self.base_url}/series/{series_id}/chapter/{chapter_id}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            imgs = soup.select("img.reader-image")
            pages = [img["src"] for img in imgs]

            self.results["results"] = pages
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def latest(self, page: int = 1):
        try:
            url = f"{self.proxy_url}{self.base_url}/series?page={page}&order=update"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            cards = soup.select("div.series-card")
            content = []

            for card in cards:
                a_tag = card.find("a")
                title = card.find("h3").get_text(strip=True)
                href = a_tag.get("href")
                image = card.find("img")["src"]
                latest = card.select_one(".chapter-link").get_text(strip=True) if card.select_one(".chapter-link") else "N/A"

                tempContent = {
                    "title": title,
                    "id": href.split("/")[-1],
                    "url": self.base_url + href,
                    "image": image,
                    "latest_chapter": latest
                }
                content.append(tempContent)

            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}

    def genres(self, genre_slug: str, page: int = 1):
        try:
            url = f"{self.proxy_url}{self.base_url}/genres/{genre_slug}?page={page}"
            response = requests.get(url, timeout=15)
            self.results["status"] = response.status_code
            soup = BeautifulSoup(response.content, "html.parser")

            cards = soup.select("div.series-card")
            content = []

            for card in cards:
                a_tag = card.find("a")
                title = card.find("h3").get_text(strip=True)
                href = a_tag.get("href")
                image = card.find("img")["src"]
                latest = card.select_one(".chapter-link").get_text(strip=True) if card.select_one(".chapter-link") else "N/A"

                tempContent = {
                    "title": title,
                    "id": href.split("/")[-1],
                    "url": self.base_url + href,
                    "image": image,
                    "latest_chapter": latest
                }
                content.append(tempContent)

            self.results["results"] = content
            return self.results

        except Exception as e:
            return {"status": "error", "results": str(e)}
