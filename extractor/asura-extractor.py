#!/usr/bin/env python3
import json
import os
import time
import re
import random
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


OUTPUT_FILE = "chapter_data.json"

# =============================================
# ADD ALL YOUR MANHWA LINKS HERE
# =============================================
MANHWA_URLS = [
    "https://asuracomic.net/series/eternally-regressing-knight-027b8cf8",
    "https://asuracomic.net/series/reaper-of-the-drifting-moon-384ff8cf",
    "https://asuracomic.net/series/star-embracing-swordmaster-fa54299a",

]
# =============================================

DELAY_BETWEEN_CHAPTERS = (3, 6)  # seconds between chapters
MAX_RETRIES = 3                   # retries per chapter if something goes wrong
RETRY_BACKOFF = 30                # seconds to wait after a real block
CHROME_VERSION = 145              # match your Chrome version (check chrome://version)


def make_driver():
    options = uc.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    # Uncomment if running on a server with no display:
    options.add_argument("--headless=new")
    return uc.Chrome(options=options, version_main=CHROME_VERSION)


def get_series_id(url):
    match = re.search(r'/series/([^/?#]+)', url)
    if not match:
        return None
    slug = match.group(1)
    # Strip trailing hash so the key is stable even if the URL ID changes
    slug = re.sub(r'-[a-f0-9]{6,10}$', '', slug)
    return slug


def is_blocked(driver):
    title = driver.title.lower()
    blocked_signals = ["403", "access denied", "forbidden", "just a moment", "rate limit", "too many requests"]
    return any(s in title for s in blocked_signals)


def get_all_chapters(driver, series_url):
    print(f"  Loading series page...")
    driver.get(series_url)
    time.sleep(4)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(2)

    chapter_links = []
    seen = set()
    for a in driver.find_elements(By.TAG_NAME, "a"):
        href = a.get_attribute("href") or ""
        if "/chapter/" in href and "asuracomic.net" in href:
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
    """Fetch pages for one chapter using the shared driver."""
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

    # Scroll to trigger lazy loading
    scroll_height = driver.execute_script("return document.body.scrollHeight")
    current = 0
    while current < scroll_height:
        driver.execute_script(f"window.scrollTo(0, {current});")
        time.sleep(0.2)
        current += 800
        scroll_height = driver.execute_script("return document.body.scrollHeight")
    time.sleep(1.5)

    pages = []
    seen = set()
    for img in driver.find_elements(By.TAG_NAME, "img"):
        src = img.get_attribute("src") or img.get_attribute("data-src") or ""
        alt = img.get_attribute("alt") or ""

        if not src:
            continue

        # Only grab images explicitly labeled as chapter or end pages
        if not re.match(r'(chapter page \d+|end page)', alt.lower()):
            continue

        # Must be a media/conversions URL — filters out profile_images, avatars, etc.
        if "gg.asuracomic.net/storage/media/" not in src and "asuracomic.net/images/" not in src:
            continue

        if src not in seen:
            seen.add(src)
            pages.append(src)

    return pages


def _try_repair_json(raw):
    """Try to salvage valid JSON from a truncated/corrupt string."""
    pos = len(raw)
    while pos > 100:
        pos -= 1
        snippet = raw[:pos].rstrip()
        for suffix in ["}}}", "}}", "}", ""]:
            try:
                return json.loads(snippet + suffix)
            except:
                continue
    return None


def load_existing_data():
    if not os.path.exists(OUTPUT_FILE):
        return {}

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        raw = f.read()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  ⚠ chapter_data.json is corrupt (char {e.pos}): {e.msg}")
        print("  Attempting automatic repair...")

        # Backup before repair
        backup = OUTPUT_FILE + ".bak"
        with open(backup, "w", encoding="utf-8") as f:
            f.write(raw)
        print(f"  Backup saved to {backup}")

        data = _try_repair_json(raw)
        if data:
            total = sum(len(v.get("chapters", {})) for v in data.values())
            print(f"  ✓ Repaired! Recovered {len(data)} series, {total} chapters")
            # Save the repaired version immediately
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return data
        else:
            print("  ✗ Could not repair automatically. Starting fresh.")
            return {}


def save_data(data):
    # Write to temp file first, then rename — prevents corruption on crash
    tmp = OUTPUT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, OUTPUT_FILE)


def process_manhwa(series_url, data):
    series_id = get_series_id(series_url)
    if not series_id:
        print(f"  ✗ Could not parse series ID from {series_url}")
        return

    print(f"\n{'='*50}")
    print(f"Processing: {series_id}")

    if series_id not in data:
        data[series_id] = {"chapters": {}}

    existing = set(data[series_id]["chapters"].keys())
    print(f"  Cached chapters: {len(existing)}")

    # Single driver for the entire series
    driver = make_driver()
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
                        driver = make_driver()
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

            save_data(data)

            if i < len(new_chapters) - 1:
                delay = random.uniform(*DELAY_BETWEEN_CHAPTERS)
                time.sleep(delay)

    finally:
        try:
            driver.quit()
        except:
            pass

    print(f"\n  Done. Total chapters: {len(data[series_id]['chapters'])}")
    if failed:
        print(f"  Failed chapters: {failed}")


def main():
    print("=== AsuraScans Bulk Extractor ===")
    print(f"Processing {len(MANHWA_URLS)} manhwa\n")

    data = load_existing_data()
    print(f"Loaded existing data: {len(data)} series cached\n")

    for url in MANHWA_URLS:
        try:
            process_manhwa(url, data)
        except Exception as e:
            print(f"  ✗ Failed entirely: {e}")
            save_data(data)
            continue

    print(f"\n{'='*50}")
    print(f"All done! Data saved to {OUTPUT_FILE}")
    total_chapters = sum(len(v["chapters"]) for v in data.values())
    print(f"Total series: {len(data)} | Total chapters: {total_chapters}")


if __name__ == "__main__":
    main()