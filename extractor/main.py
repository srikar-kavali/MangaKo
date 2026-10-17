#!/usr/bin/env python3
import os
import certifi
import argparse
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from shared.storage import load_data, save_data
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / '.env')

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# =============================================
# ADD ALL YOUR MANHWA LINKS HERE
# =============================================
MANHWA_URLS = [
    # --- Asura Scans ---
    "https://asurascans.com/comics/absolute-sword-sense-19cdf401",

    # --- Mgeko ---
    #"https://www.mgeko.cc/manga/manga-si7aaa/all-chapters/", # tower of god
    #"https://www.mgeko.cc/manga/urek-s-ascent/all-chapters/", #urek mazino
    #"https://www.mgeko.cc/manga/infinite-level-up-in-murim/all-chapters/",
    #"https://www.mgeko.cc/manga/player-mg1/all-chapters/",
    #"https://www.mgeko.cc/manga/the-beginning-after-the-end/all-chapters/",
    #"https://www.mgeko.cc/manga/mercenary-enrollment-mg12/all-chapters/",
    #"https://www.mgeko.cc/manga/manga-q1113/all-chapters/", #Eleceed
    #"https://www.mgeko.cc/manga/absolute-dominion/all-chapters/",
    #"https://www.mgeko.cc/manga/memoir-of-the-king-of-war-sop/all-chapters/",
    #"https://www.mgeko.cc/manga/eternal-force/all-chapters/",
    #"https://www.mgeko.cc/manga/the-story-of-a-low-rank-soldier-becoming-a-monarch-mg1/all-chapters/",
    #"https://www.mgeko.cc/manga/the-long-way-of-the-warrior/all-chapters/",
    #"https://www.mgeko.cc/manga/regressed-life-of-the-sword-clans-ignoble-reincarnator/all-chapters/",
]
# =============================================


def get_site(url):
    domain = urlparse(url).netloc
    if "asurascans.com" in domain or "asuracomic.net" in domain:
        return "asura"
    if "mgeko.cc" in domain:
        return "mgeko"
    return None


# The local chapter_data.json is a cache. Supabase is authoritative for
# chapters already uploaded. Syncing from cloud happens before scraping.
from shared.cloud_sync import (
    get_supabase_client, hydrate_local_cache, upload_changed_chapters,
    extract_chapters, valid_chapters,
)


def get_scraper(site):
    if site == "asura":
        from sites.asura import scrape, get_series_id
    elif site == "mgeko":
        from sites.mgeko import scrape, get_series_id
    else:
        raise ValueError(f"Unsupported source: {site}")
    return scrape, get_series_id


def main():
    parser = argparse.ArgumentParser(description="Supabase-first chapter extractor")
    parser.add_argument("--sync-only", action="store_true",
                        help="Read Supabase into local JSON without scraping or uploading")
    args = parser.parse_args()

    print("=== Manhwa Extractor ===")
    data = load_data()
    print(f"Loaded local cache: {len(data)} series")

    client = get_supabase_client()
    if client is None:
        raise SystemExit("Supabase credentials are required to protect the database-first workflow.")

    # Never mutate the local cache if we cannot complete the cloud read.
    remote = hydrate_local_cache(client, data)
    local_path = Path("chapter_data.json")
    if local_path.exists():
        backup = local_path.with_name(
            f"chapter_data.json.backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        shutil.copy2(local_path, backup)
        print(f"Local backup saved: {backup}")
    save_data(data)
    print(f"Cloud cache restored: {len(remote)} series, "
          f"{sum(len(ch) for ch in remote.values())} chapters")

    if args.sync_only:
        print("Sync-only complete: no scraping or Supabase writes.")
        return

    for url in MANHWA_URLS:
        site = get_site(url)
        if not site:
            print(f"Skipping unsupported URL: {url}")
            continue

        scrape, get_series_id = get_scraper(site)
        series_id = get_series_id(url)
        if not series_id:
            print(f"Could not parse exact series ID: {url}")
            continue

        # Record the cloud baseline; only newly scraped or changed chapters
        # are candidates for upload. Never delete existing cloud chapters.
        cloud_before = remote.get(series_id, {})
        local_before = valid_chapters(extract_chapters(data.get(series_id, {})))
        print(f"-> Processing {series_id} ({len(cloud_before)} cloud chapters)")

        try:
            scrape(url, data)
            after = valid_chapters(extract_chapters(data.get(series_id, {})))
            updated = {
                k: pages for k, pages in after.items()
                if pages != local_before.get(k) and pages != cloud_before.get(k)
            }
            if updated:
                upload_changed_chapters(client, series_id, updated)
                print(f"Uploaded {len(updated)} new/updated chapters")
            else:
                print("No new chapters to upload")
            save_data(data)
        except Exception as error:
            save_data(data)
            print(f"Extraction/upload failed for {series_id}: {error}")
            continue

    print(f"Finished. Local series: {len(data)}; cloud baseline: {len(remote)}")


if __name__ == "__main__":
    main()