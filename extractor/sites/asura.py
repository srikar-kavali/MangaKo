import re
import time
import random
from urllib.parse import urlparse

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from shared.driver import (
    make_driver,
    is_blocked,
    safe_quit,
)
from shared.scroll import full_scroll


DELAY_BETWEEN_CHAPTERS = (3, 6)
MAX_RETRIES = 3
MAX_CRASH_RESTARTS = 5
RETRY_BACKOFF = 30

CRASH_SIGNALS = [
    "no such window",
    "target window already closed",
    "web view not found",
    "invalid session id",
    "chrome not reachable",
    "tab crashed",
    "session deleted because of page crash",
    "not connected to devtools",
    "disconnected",
]


def is_crash_error(err_str):
    err_str = str(err_str).lower()
    return any(signal_text in err_str for signal_text in CRASH_SIGNALS)


def get_series_id(url):
    match = re.search(r'/(?:series|comics)/([^/?#]+)', url)
    if not match:
        return None

    slug = match.group(1)
    slug = re.sub(r'-[a-f0-9]{6,10}$', '', slug)
    return slug


def is_driver_alive(driver):
    if driver is None:
        return False
    try:
        handles = driver.window_handles
        if not handles:
            return False
        driver.switch_to.window(handles[0])
        _ = driver.current_url
        return True
    except Exception:
        return False


def restart_driver(driver, delay=(5, 8)):
    safe_quit(driver)
    time.sleep(random.uniform(*delay))
    return make_driver(headless=True)


def get_all_chapters(driver, series_url):
    print("  Loading series page...")
    time.sleep(1)

    driver.get(series_url)

    try:
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
    except Exception:
        pass

    time.sleep(4)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)

    if is_blocked(driver):
        raise ConnectionError(f"Blocked on series page (title: {driver.title})")

    domain = urlparse(series_url).netloc
    chapter_links = []
    seen = set()

    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""

        if "/chapter/" not in href or domain not in href:
            continue

        match = re.search(r'/chapter/(\d+(?:\.\d+)?)', href)
        if not match or href in seen:
            continue

        seen.add(href)
        chapter_links.append({
            "number": float(match.group(1)),
            "url": href,
            "id": match.group(1),
        })

    chapter_links.sort(key=lambda x: x["number"])
    return chapter_links


def get_chapter_pages(driver, chapter):
    time.sleep(1)
    driver.get(chapter["url"])

    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "img"))
        )
    except Exception:
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

        alt_lower = alt.lower()
        is_chapter_page = (
                re.match(r'(chapter page \d+|end page)', alt_lower)
                or re.match(r'page \d+\s*-\s*chapter', alt_lower)
                or re.match(r'page \d+', alt_lower)
        )

        if not is_chapter_page:
            continue

        valid_cdn = any(
            cdn in src
            for cdn in [
                "gg.asuracomic.net/storage/media/",
                "asuracomic.net/images/",
                "cdn.asurascans.com/asura-images/chapters/",
                "cdn.asurascans.com/asura-images/chapters-restored/",
            ]
        )

        if not valid_cdn or src in seen:
            continue

        seen.add(src)
        pages.append(src)

    return pages


def _load_series_with_recovery(driver, series_url):
    request_attempt = 0
    crash_restarts = 0

    while request_attempt < MAX_RETRIES:
        try:
            if not is_driver_alive(driver):
                print("  ⚠ Driver not alive before series page load — restarting...")
                driver = restart_driver(driver)

            chapters = get_all_chapters(driver, series_url)
            return driver, chapters

        except ConnectionError as e:
            request_attempt += 1
            print(f"  ⚠ Series page blocked ({request_attempt}/{MAX_RETRIES}): {e}")

            if request_attempt < MAX_RETRIES:
                safe_quit(driver)
                wait = RETRY_BACKOFF * request_attempt + random.uniform(5, 15)
                print(f"  Restarting driver and waiting {wait:.0f}s...")
                time.sleep(wait)
                driver = make_driver(headless=True)

        except Exception as e:
            err_str = str(e)
            if is_crash_error(err_str):
                crash_restarts += 1
                print(f"  ⚠ Chrome crashed loading series page (restart {crash_restarts}/{MAX_CRASH_RESTARTS})")
                print(f"    Exception: {type(e).__name__}")
                print(f"    Message: {e}")

                if crash_restarts >= MAX_CRASH_RESTARTS:
                    return driver, None

                driver = restart_driver(driver, (8, 15))
                continue

            request_attempt += 1
            print(f"  ✗ Error loading series page ({request_attempt}/{MAX_RETRIES}): {type(e).__name__}: {e}")
            if request_attempt < MAX_RETRIES:
                time.sleep(5)

    return driver, None


def _fetch_chapter_with_recovery(driver, chapter):
    request_attempt = 0
    crash_restarts = 0

    while request_attempt < MAX_RETRIES:
        try:
            if not is_driver_alive(driver):
                print("\n    ⚠ Driver window closed — restarting...")
                driver = restart_driver(driver)

            pages = get_chapter_pages(driver, chapter)
            return driver, pages

        except ConnectionError as e:
            request_attempt += 1
            print(f"\n    ⚠ Attempt {request_attempt}/{MAX_RETRIES} blocked: {e}")

            if request_attempt < MAX_RETRIES:
                safe_quit(driver)
                wait = RETRY_BACKOFF * request_attempt + random.uniform(5, 15)
                print(f"    Restarting driver and waiting {wait:.0f}s...")
                time.sleep(wait)
                driver = make_driver(headless=True)

        except Exception as e:
            err_str = str(e)
            if is_crash_error(err_str):
                crash_restarts += 1
                print(f"\n    ⚠ Chrome crashed — restart {crash_restarts}/{MAX_CRASH_RESTARTS}")

                if crash_restarts >= MAX_CRASH_RESTARTS:
                    print(f"    ✗ Last Chrome error: {type(e).__name__}: {e}")
                    return driver, None

                driver = restart_driver(driver, (8, 15))
                continue

            request_attempt += 1
            print(f"\n    ✗ Attempt {request_attempt}/{MAX_RETRIES} error: {type(e).__name__}: {e}")
            if request_attempt < MAX_RETRIES:
                time.sleep(5)

    return driver, None


def scrape(series_url, data):
    series_id = get_series_id(series_url)
    if not series_id:
        print(f"  ✗ Could not parse series ID from {series_url}")
        return

    print(f"\n{'=' * 50}")
    print(f"Processing: {series_id} [asura]")

    if series_id not in data:
        data[series_id] = {"chapters": {}}

    existing = set(data[series_id]["chapters"].keys())
    print(f"  Cached chapters: {len(existing)}")

    driver = None
    failed = []

    try:
        driver = make_driver(headless=True)
        driver, all_chapters = _load_series_with_recovery(driver, series_url)

        if all_chapters is None:
            print(f"  ✗ Could not load series page after retries — skipping series")
            return

        new_chapters = [ch for ch in all_chapters if ch["id"] not in existing]
        print(f"  Total on site: {len(all_chapters)} | New to fetch: {len(new_chapters)}")

        if not new_chapters:
            print(f"  ✓ Already up to date!")
            return

        for i, ch in enumerate(new_chapters):
            print(f"  Fetching Ch.{ch['id']} ({i+1}/{len(new_chapters)})...", end=" ", flush=True)

            if i > 0 and i % 30 == 0:
                print(f"\n  🔄 Recycling Chrome GUI instance (30-chapter threshold)...")
                driver = restart_driver(driver, (3, 5))

            driver, pages = _fetch_chapter_with_recovery(driver, ch)

            if pages:
                data[series_id]["chapters"][ch["id"]] = pages
                print(f"✓ {len(pages)} pages")
            else:
                failed.append(ch["id"])
                print(f"✗ failed after max retries")

            from shared.storage import save_data
            save_data(data)

            if i < len(new_chapters) - 1:
                delay = random.uniform(*DELAY_BETWEEN_CHAPTERS)
                if (i + 1) % 50 == 0:
                    print(f"  💤 Cooldown after {i+1} chapters (30s)...")
                    time.sleep(30)
                else:
                    time.sleep(delay)

    finally:
        safe_quit(driver)

    print(f"\n  Done. Total chapters: {len(data[series_id]['chapters'])}")
    if failed:
        print(f"  Failed chapters: {failed}")