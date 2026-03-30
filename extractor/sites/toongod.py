import re
import time
import random
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from shared.driver import make_driver, is_blocked
from shared.scroll import full_scroll

DELAY_BETWEEN_CHAPTERS = (3, 6)
MAX_RETRIES = 3
RETRY_BACKOFF = 30


def get_series_id(url):
    # URL format: https://toongod.org/webtoon/eleceed/
    match = re.search(r'/webtoon/([^/?#]+)', url)
    if not match:
        return None
    return "toongod__" + match.group(1).rstrip('/')


def get_all_chapters(driver, series_url):
    print(f"  Loading series page...")
    driver.get(series_url)

    # Wait for at least one chapter link to appear in the DOM
    try:
        WebDriverWait(driver, 15).until(
            lambda d: any(
                "/chapter-" in (a.get_attribute("href") or "")
                for a in d.find_elements(By.TAG_NAME, "a")
            )
        )
    except:
        print("  ⚠ Timed out waiting for chapter links")

    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)

    # Click "Show More" until all chapters are loaded
    while True:
        try:
            show_more = driver.find_element(
                By.XPATH,
                "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'show more')]"
            )
            if show_more.is_displayed():
                driver.execute_script("arguments[0].click();", show_more)
                print("  Clicked 'show more'...")
                time.sleep(2)
            else:
                break
        except:
            break

    chapter_links = []
    seen = set()

    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""
        # ToonGod chapter URLs: https://www.toongod.org/webtoon/<slug>/chapter-<N>/
        # Domain check uses 'toongod.org' to match both www. and non-www variants
        if "chapter-" in href and "toongod.org" in href:
            match = re.search(r'/chapter-(\d+(?:\.\d+)?)', href)
            if match and href not in seen:
                seen.add(href)
                chapter_links.append({
                    "number": float(match.group(1)),
                    "url": href,
                    "id": match.group(1)
                })

    chapter_links.sort(key=lambda x: x["number"])

    if not chapter_links:
        print("  ⚠ No chapters found. Sample hrefs from page:")
        for a in driver.find_elements(By.TAG_NAME, "a")[:20]:
            href = a.get_attribute("href") or ""
            if href:
                print(f"    {href}")

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

        if not src:
            continue

        # ToonGod serves all chapter images from i.tngcdn.com
        # Images have empty alt text — filter purely by CDN domain
        if "i.tngcdn.com/" not in src:
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
    print(f"Processing: {series_id} [toongod]")

    if series_id not in data:
        data[series_id] = {"chapters": {}}

    existing = set(data[series_id]["chapters"].keys())
    print(f"  Cached chapters: {len(existing)}")

    driver = make_driver(headless=False)
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