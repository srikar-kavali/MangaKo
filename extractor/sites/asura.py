import re
import time
import random
from urllib.parse import urlparse
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from shared.driver import make_driver, is_blocked
from shared.scroll import full_scroll

DELAY_BETWEEN_CHAPTERS = (3, 6)
MAX_RETRIES = 3
RETRY_BACKOFF = 30


def get_series_id(url):
    match = re.search(r'/(?:series|comics)/([^/?#]+)', url)
    if not match:
        return None
    slug = match.group(1)
    # Strip trailing hash (e.g. -9b94cd20) so the key is stable
    slug = re.sub(r'-[a-f0-9]{6,10}$', '', slug)
    return slug


def get_all_chapters(driver, series_url):
    print(f"  Loading series page...")
    driver.get(series_url)
    time.sleep(4)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)

    domain = urlparse(series_url).netloc

    chapter_links = []
    seen = set()
    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""
        if "/chapter/" in href and domain in href:
            match = re.search(r'/chapter/(\d+(?:\.\d+)?)', href)
            if match and href not in seen:
                seen.add(href)
                chapter_links.append({
                    "number": float(match.group(1)),
                    "url": href,
                    "id": match.group(1)
                })

    chapter_links.sort(key=lambda x: x["number"])
    return chapter_links


def get_chapter_pages(driver, chapter):
    driver.get(chapter["url"])
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "img"))
        )
    except:
        pass

    time.sleep(2)

    if is_blocked(driver):
        raise ConnectionError(f"Blocked on chapter {chapter['id']} (title: {driver.title})")

    full_scroll(driver)

    pages = []
    seen = set()
    for img in driver.find_elements(By.TAG_NAME, "img"):
        src = img.get_attribute("src") or img.get_attribute("data-src") or ""
        alt = img.get_attribute("alt") or ""

        if not src:
            continue

        is_chapter_page = (
                re.match(r'(chapter page \d+|end page)', alt.lower()) or
                re.match(r'page \d+\s*-\s*chapter', alt.lower())
        )
        if not is_chapter_page:
            continue

        if not any(cdn in src for cdn in [
            "gg.asuracomic.net/storage/media/",
            "asuracomic.net/images/",
            "cdn.asurascans.com/asura-images/chapters/",
        ]):
            continue

        if src not in seen:
            seen.add(src)
            pages.append(src)

    return pages


def scrape(series_url, data):
    series_id = get_series_id(series_url)
    if not series_id:
        print(f"  ✗ Could not parse series ID from {series_url}")
        return

    print(f"\n{'='*50}")
    print(f"Processing: {series_id} [asura]")

    if series_id not in data:
        data[series_id] = {"chapters": {}}

    existing = set(data[series_id]["chapters"].keys())
    print(f"  Cached chapters: {len(existing)}")

    driver = make_driver(headless=True)
    try:
        all_chapters = get_all_chapters(driver, series_url)
        new_chapters = [ch for ch in all_chapters if ch["id"] not in existing]
        print(f"  Total on site: {len(all_chapters)} | New to fetch: {len(new_chapters)}")

        if not new_chapters:
            print(f"  ✓ Already up to date!")
            return

        failed = []
        for i, ch in enumerate(new_chapters):
            print(f"  Fetching Ch.{ch['id']} ({i+1}/{len(new_chapters)})...", end=" ", flush=True)

            pages = None
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    pages = get_chapter_pages(driver, ch)
                    break
                except ConnectionError as e:
                    print(f"\n    ⚠ Attempt {attempt}/{MAX_RETRIES} blocked: {e}")
                    if attempt < MAX_RETRIES:
                        try:
                            driver.quit()
                        except:
                            pass
                        wait = RETRY_BACKOFF * attempt + random.uniform(5, 15)
                        print(f"    Restarting driver and waiting {wait:.0f}s...")
                        time.sleep(wait)
                        driver = make_driver(headless=True)
                except Exception as e:
                    print(f"\n    ✗ Attempt {attempt}/{MAX_RETRIES} error: {e}")
                    if attempt < MAX_RETRIES:
                        time.sleep(5)

            if pages:
                data[series_id]["chapters"][ch["id"]] = pages
                print(f"✓ {len(pages)} pages")
            else:
                failed.append(ch["id"])
                print(f"✗ failed after {MAX_RETRIES} attempts")

            from shared.storage import save_data
            save_data(data)

            if i < len(new_chapters) - 1:
                time.sleep(random.uniform(*DELAY_BETWEEN_CHAPTERS))

    finally:
        try:
            driver.quit()
        except:
            pass

    print(f"\n  Done. Total chapters: {len(data[series_id]['chapters'])}")
    if failed:
        print(f"  Failed chapters: {failed}")