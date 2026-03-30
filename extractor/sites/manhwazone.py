import re
import time
import random
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from shared.driver import make_driver, is_blocked
from shared.scroll import full_scroll

DELAY_BETWEEN_CHAPTERS = (5, 10)
MAX_RETRIES = 3
RETRY_BACKOFF = 30


def get_series_id(url):
    match = re.search(r'/series/([^/?#]+)', url)
    if not match:
        return None
    slug = match.group(1).rstrip('/')
    slug = re.sub(r'-[a-z0-9]{4,8}$', '', slug)
    return "manhwazone__" + slug


def get_all_chapters(driver, series_url):
    print(f"  Loading series page...")
    driver.get(series_url)

    try:
        WebDriverWait(driver, 15).until(
            lambda d: any(
                "/chapter-" in (a.get_attribute("href") or "")
                for a in d.find_elements(By.TAG_NAME, "a")
            )
        )
    except:
        print("  ⚠ Timed out waiting for chapter links")

    time.sleep(2)

    try:
        container = driver.find_element(
            By.XPATH,
            "//div[contains(@class,'max-h-[80vh]') and contains(@class,'overflow-y-auto')]"
        )
    except:
        container = None
        print("  ⚠ Could not find chapter container, falling back to page scroll")

    if container:
        last_count = 0
        stall = 0
        while stall < 5:
            driver.execute_script(
                "arguments[0].scrollTop = arguments[0].scrollTop + 800;", container
            )
            time.sleep(1.5)

            links = driver.find_elements(By.XPATH, "//a[contains(@href,'/chapter-')]")
            current_count = len(set(
                a.get_attribute("href") for a in links if a.get_attribute("href")
            ))

            print(f"  Scrolling chapter list... {current_count} links found", end="\r")

            if current_count == last_count:
                stall += 1
            else:
                stall = 0
            last_count = current_count

        print()
    else:
        scroll_height = driver.execute_script("return document.body.scrollHeight")
        current = 0
        while current < scroll_height:
            driver.execute_script(f"window.scrollTo(0, {current});")
            time.sleep(0.3)
            current += 600
            scroll_height = driver.execute_script("return document.body.scrollHeight")
        time.sleep(1)

    chapter_links = []
    seen = set()

    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""
        if "/chapter-" in href and "manhwazone" in href:
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

    time.sleep(2)

    current_url = driver.current_url
    if "manhwazone" not in current_url:
        raise ConnectionError(f"Redirected to ad/external page: {current_url}")

    title = driver.title.lower()
    if any(s in title for s in ["adblock", "ad block", "hero", "download", "install", "403", "forbidden"]):
        raise ConnectionError(f"Ad interstitial detected (title: {driver.title})")

    if is_blocked(driver):
        raise ConnectionError(f"Blocked on chapter {chapter['id']} (title: {driver.title})")

    try:
        WebDriverWait(driver, 25).until(
            lambda d: any(
                any(cdn in (img.get_attribute("src") or "") or
                    cdn in (img.get_attribute("data-src") or "")
                    for cdn in ["manhwatop.com", "manhwazone", "c2.", "c3.", "c4."])
                for img in d.find_elements(By.TAG_NAME, "img")
            )
        )
    except:
        print(f"\n  ⚠ Timed out waiting for images on chapter {chapter['id']}, proceeding anyway")

    pages = []
    seen = set()

    for img in driver.find_elements(By.TAG_NAME, "img"):
        src = img.get_attribute("data-src") or img.get_attribute("src") or ""
        cls = img.get_attribute("class") or ""

        if not src:
            continue
        if "mr-img" not in cls:
            continue
        if "1x1.webp" in src:
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
    print(f"Processing: {series_id} [manhwazone]")

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
                    if not pages:
                        raise ValueError("0 pages returned — images may not have loaded")
                    break
                except ConnectionError as e:
                    print(f"\n    ⚠ Attempt {attempt}/{MAX_RETRIES} blocked/redirected: {e}")
                    if attempt < MAX_RETRIES:
                        try:
                            driver.quit()
                        except:
                            pass
                        wait = RETRY_BACKOFF * attempt + random.uniform(10, 20)
                        print(f"    Restarting driver and waiting {wait:.0f}s...")
                        time.sleep(wait)
                        driver = make_driver(headless=False)
                        try:
                            driver.get(series_url)
                            time.sleep(3)
                        except:
                            pass
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