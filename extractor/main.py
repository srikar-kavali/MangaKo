#!/usr/bin/env python3
import os
import certifi
from urllib.parse import urlparse
from shared.storage import load_data, save_data
from dotenv import load_dotenv

load_dotenv()

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


# ── Supabase upload helper ────────────────────────────────────────────────────
def get_supabase_client():
    """Returns Supabase client or None if credentials missing."""
    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not url or not key:
            print("  ⚠ Supabase credentials not found — skipping upload")
            return None
        return create_client(url, key)
    except ImportError:
        print("  ⚠ supabase package not installed — skipping upload")
        return None


def upload_series_to_supabase(client, series_id, chapters):
    """Upload only new/changed chapters for a series to Supabase."""
    if not client or not chapters:
        return 0

    rows = [
        {
            "series_id": series_id,
            "chapter_id": chapter_id,
            "pages": pages,
        }
        for chapter_id, pages in chapters.items()
        if isinstance(pages, list) and len(pages) > 0
    ]

    if not rows:
        return 0

    # Upsert in batches of 100
    total = 0
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        client.table("chapters").upsert(
            batch,
            on_conflict="series_id,chapter_id"
        ).execute()
        total += len(batch)

    return total


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=== Manhwa Extractor ===")
    print(f"Processing {len(MANHWA_URLS)} titles\n")

    data = load_data()
    print(f"Loaded existing data: {len(data)} series cached\n")

    # Init Supabase client once — reuse for all series
    supabase = get_supabase_client()
    if supabase:
        print("✓ Supabase connected\n")

    for url in MANHWA_URLS:
        site = get_site(url)
        if not site:
            print(f"  ✗ Unknown site for URL: {url}")
            continue

        print(f"-> Processing: {url}")

        try:
            if site == "asura":
                from extractor.sites.asura import scrape
                scrape(url, data)

            elif site == "mgeko":
                from extractor.sites.mgeko import scrape
                scrape(url, data)

            # Match what the scraper wrote directly to the data keys
            series_id = _get_series_id_from_url(url, data)

            if series_id and series_id in data:
                # Support both nested structure and flat structure safely
                series_entry = data[series_id]
                if isinstance(series_entry, dict) and "chapters" in series_entry:
                    chapters = series_entry["chapters"]
                else:
                    chapters = series_entry

                if supabase:
                    uploaded = upload_series_to_supabase(supabase, series_id, chapters)
                    if uploaded > 0:
                        print(f"  ☁ Automatically uploaded {uploaded} chapters to Supabase")
            else:
                print(f"  ⚠ Could not resolve unique database ID for: {url}")

        except Exception as e:
            print(f"  ✗ Failed entirely during extraction/upload: {e}")
            continue

    # Critical: Save all updates down to disk at the end
    save_data(data)
    print(f"\n{'='*50}")
    print(f"All done! Data saved to chapter_data.json")

    # Print clean diagnostic totals
    total_chaps = 0
    for v in data.values():
        if isinstance(v, dict) and "chapters" in v:
            total_chaps += len(v["chapters"])
        else:
            total_chaps += len(v)

    print(f"Total series: {len(data)} | Total chapters: {total_chaps}")


def _get_series_id_from_url(url, data):
    """
    Finds the exact key slug generated by your scraper within the loaded data dictionary.
    """
    path = urlparse(url).path.strip("/")
    parts = [p for p in path.split("/") if p and p not in ("manga", "comics", "all-chapters")]
    if parts:
        slug = parts[-1]  # Safely grabs the trailing unique title slug identifier

        # Check explicit exact matching first
        if slug in data:
            return slug

        # Fallback to fuzzy dictionary indexing checks
        for key in data.keys():
            if slug in key or key in slug:
                return key
    return None


if __name__ == "__main__":
    main()