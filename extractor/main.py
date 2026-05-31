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

        # Track chapter count before scraping so we know what's new
        series_id = None
        chapters_before = 0

        try:
            if site == "asura":
                from extractor.sites.asura import scrape
                scrape(url, data)

            elif site == "mgeko":
                from extractor.sites.mgeko import scrape
                scrape(url, data)

            else:
                print(f"  ✗ Unknown site for URL: {url}")
                continue

            # Find the series_id that was just updated
            # scrape() updates data in-place — find the key that matches this URL
            # We detect it by finding a series whose chapter count changed
            # Simpler: re-derive series_id from URL the same way scrape() does
            series_id = _get_series_id_from_url(url, data)

            if series_id and supabase and series_id in data:
                chapters = data[series_id].get("chapters", data[series_id])
                uploaded = upload_series_to_supabase(supabase, series_id, chapters)
                if uploaded > 0:
                    print(f"  ☁ Uploaded {uploaded} chapters to Supabase")

        except Exception as e:
            print(f"  ✗ Failed entirely: {e}")
            save_data(data)
            continue

    print(f"\n{'='*50}")
    print(f"All done! Data saved to chapter_data.json")
    total = sum(len(v.get("chapters", v)) for v in data.values())
    print(f"Total series: {len(data)} | Total chapters: {total}")


def _get_series_id_from_url(url, data):
    """
    Try to find the series_id in data that corresponds to this URL.
    Falls back to checking all keys if we can't derive it directly.
    This works because scrape() uses the URL slug as the series key.
    """
    from urllib.parse import urlparse
    path = urlparse(url).path.strip("/")
    # mgeko: /manga/some-slug/all-chapters -> some-slug
    # asura: /comics/some-slug -> some-slug
    parts = [p for p in path.split("/") if p and p not in ("manga", "comics", "all-chapters")]
    if parts:
        slug = parts[0]
        # Check data keys for a match
        for key in data.keys():
            if slug in key:
                return key
    return None


if __name__ == "__main__":
    main()