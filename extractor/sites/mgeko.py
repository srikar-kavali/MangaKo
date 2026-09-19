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

CRASH_SIGNALS = [
    "no such window",
    "target window already closed",
    "web view not found",
    "invalid session id",
    "chrome not reachable",
]

SLUG_OVERRIDES = {
    "manga-pl822": "noblesse",
    "manga-si7aaa": "tower-of-god",
    "manga-q1113": "eleceed",
    "manga-187j": "the-boxer",
    "7237": "the-god-of-high-school",
    "northern-b-manhwa": "legend-of-the-northern-blade",
    "leviathansdads": "leviathan",
    "wind-breaker-cs": "wind-breaker",
    "memoir-of-the-king-of-war-sop": "memoir-of-the-king-of-war",
    "chronicles-of-heavenly-demon-mg1": "chronicles-of-the-heavenly-demon",
    "eternal-force": "the-breaker-eternal-force",
    "the-breaker22": "the-breaker",
    "the-story-of-a-low-rank-soldier-becoming-a-monarch-mg1": "the-story-of-a-low-rank-soldier-becoming-a-monarch",
    "manga-mm990169": "mage-again",
    "manga-1089": "hardcore-leveling-warrior"
}


def is_crash_error(err_str):
    return any(msg in err_str for msg in CRASH_SIGNALS)


def get_series_id(url):
    match = re.search(r'/manga/([^/?#]+)', url)
    if not match:
        return None
    slug = match.group(1).rstrip('/')
    slug = SLUG_OVERRIDES.get(slug, slug)
    return "mgeko__" + slug


def is_driver_alive(driver):
    try:
        _ = driver.window_handles
        return True
    except Exception:
        return False


def safe_quit(driver):
    try:
        driver.quit()
    except Exception:
        pass


def get_all_chapters(driver, series_url):
    print(f"  Loading series page...")
    driver.get(series_url)
    time.sleep(3)

    if is_blocked(driver):
        print(f"  ⚠ Blocked on series page — Cloudflare challenge")
        return []

    series_slug = re.search(r'/manga/([^/?#]+)', series_url).group(1).rstrip('/')
    all_chapters_url = f"https://www.mgeko.cc/manga/{series_slug}/all-chapters/"
    print(f"  Loading all-chapters page...")
    driver.get(all_chapters_url)

    try:
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
    except Exception:
        pass
    time.sleep(4)

    if is_blocked(driver):
        print(f"  ⚠ Blocked on all-chapters page")
        return []

    try:
        WebDriverWait(driver, 30).until(
            lambda d: len(d.find_elements(By.XPATH, "//a[contains(@href,'/reader/')]")) > 2
        )
    except Exception:
        print("  ⚠ Timed out waiting for chapter links")

    try:
        container = driver.find_element(By.CSS_SELECTOR, "ul.chapter-list")
        last_count = 0
        stall = 0
        while stall < 5:
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollTop + 800;", container)
            time.sleep(1.0)
            links = driver.find_elements(By.XPATH, "//a[contains(@href,'/reader/')]")
            current_count = len(set(
                a.get_attribute("href") for a in links if a.get_attribute("href")
            ))
            if current_count == last_count:
                stall += 1
            else:
                stall = 0
            last_count = current_count
    except Exception:
        full_scroll(driver, step=800, pause=0.3, settle=1.0)

    chapter_links = []
    seen = set()

    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""
        if "/reader/en/" not in href or "mgeko.cc" not in href:
            continue
        match = re.search(r'-chapter-(\d+(?:\.\d+)?)-eng', href)
        if match and href not in seen:
            num = float(match.group(1))
            if num == 0:
                continue
            seen.add(href)
            chapter_links.append({
                "number": num,
                "url": href,
                "id": match.group(1)
            })

    chapter_links.sort(key=lambda x: x["number"])
    return chapter_links


def get_chapter_pages(driver, chapter):
    driver.get(chapter["url"])
    time.sleep(2)

    if is_blocked(driver):
        raise ConnectionError(f"Blocked on chapter {chapter['id']} (title: {driver.title})")

    try:
        WebDriverWait(driver, 20).until(
            lambda d: any(
                "imgsrv" in (img.get_attribute("src") or "")
                for img in d.find_elements(By.TAG_NAME, "img")
            )
        )
    except Exception:
        pass

    full_scroll(driver, step=800, pause=0.2, settle=1.0)

    pages = []
    seen = set()
    CHAPTER_IMG_RE = re.compile(r'/chapter-[^/]+/[^/]+\.\w+(?:\?.*)?$', re.IGNORECASE)

    for img in driver.find_elements(By.TAG_NAME, "img"):
        src = img.get_attribute("src") or ""
        if not src or "imgsrv" not in src or not CHAPTER_IMG_RE.search(src):
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
    print(f"Processing: {series_id} [mgeko]")

    if series_id not in data:
        data[series_id] = {"chapters": {}}

    existing = set(data[series_id]["chapters"].keys())
    print(f"  Cached chapters: {len(existing)}")

    # Always enforce GUI mode (headless=False) for mgeko
    driver = make_driver(headless=False)
    try:
        all_chapters = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                if not is_driver_alive(driver):
                    print(f"  ⚠ Driver not alive before series page load — restarting...")
                    safe_quit(driver)
                    time.sleep(5)
                    driver = make_driver(headless=False)

                all_chapters = get_all_chapters(driver, series_url)
                break

            except Exception as e:
                err_str = str(e)
                if is_crash_error(err_str):
                    print(f"  ⚠ Chrome crashed loading series page (attempt {attempt}/{MAX_RETRIES}) — restarting driver...")
                    safe_quit(driver)
                    time.sleep(random.uniform(8, 15))
                    driver = make_driver(headless=False)
                    continue
                else:
                    print(f"  ✗ Error loading series page (attempt {attempt}/{MAX_RETRIES}): {e}")
                    if attempt < MAX_RETRIES:
                        time.sleep(5)

        if all_chapters is None:
            print(f"  ✗ Could not load series page after {MAX_RETRIES} attempts — skipping series")
            return

        new_chapters = [ch for ch in all_chapters if ch["id"] not in existing]
        print(f"  Total on site: {len(all_chapters)} | New to fetch: {len(new_chapters)}")

        if not new_chapters:
            print(f"  ✓ Already up to date!")
            return

        failed = []
        for i, ch in enumerate(new_chapters):
            print(f"  Fetching Ch.{ch['id']} ({i+1}/{len(new_chapters)})...", end=" ", flush=True)

            # Recycling driver every 30 chapters to clear GUI memory leak
            if i > 0 and i % 30 == 0:
                print(f"\n  🔄 Recycling Chrome GUI instance (30-chapter threshold)...")
                safe_quit(driver)
                time.sleep(3)
                driver = make_driver(headless=False)

            pages = None
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    if not is_driver_alive(driver):
                        print(f"\n    ⚠ Driver window closed — restarting...")
                        safe_quit(driver)
                        time.sleep(5)
                        driver = make_driver(headless=False)

                    pages = get_chapter_pages(driver, ch)
                    if not pages:
                        raise ValueError("0 pages returned")
                    break

                except ConnectionError as e:
                    print(f"\n    ⚠ Attempt {attempt}/{MAX_RETRIES} blocked: {e}")
                    if attempt < MAX_RETRIES:
                        safe_quit(driver)
                        wait = RETRY_BACKOFF * attempt + random.uniform(5, 15)
                        print(f"    Restarting driver and waiting {wait:.0f}s...")
                        time.sleep(wait)
                        driver = make_driver(headless=False)

                except Exception as e:
                    err_str = str(e)
                    if is_crash_error(err_str):
                        print(f"\n    ⚠ Chrome window crashed — restarting driver...")
                        safe_quit(driver)
                        time.sleep(random.uniform(8, 15))
                        driver = make_driver(headless=False)
                        continue
                    else:
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