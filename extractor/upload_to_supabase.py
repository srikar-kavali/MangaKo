# extractor/upload_to_supabase.py
# Run this after main.py finishes fetching chapters.
# Or call upload_series() directly from main.py (see bottom of file).
#
# Install dependency: pip install supabase
#
# Set these env vars (or put them in a .env file):
#   SUPABASE_URL=https://xxxx.supabase.co
#   SUPABASE_SERVICE_KEY=eyJh...  ← service_role key, NOT anon key

import os
import json
import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    print("Run: pip install supabase")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
CHAPTER_DATA_PATH = Path(__file__).parent / "chapter_data.json"

# ── Upload ────────────────────────────────────────────────────────────────────

def get_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.\n"
            "Get them from: Supabase dashboard → Settings → API"
        )
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def upload_series(series_id: str, chapters: dict, client: Client = None):
    """
    Upload all chapters for one series.
    chapters = { "68": [url, url, ...], "69": [...], ... }
    Only upserts — won't duplicate existing chapters.
    """
    if client is None:
        client = get_client()

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
        print(f"  {series_id}: no chapters to upload")
        return 0

    # Upsert in batches of 100 (Supabase row limit per request)
    batch_size = 100
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        client.table("chapters").upsert(
            batch,
            on_conflict="series_id,chapter_id"  # skip if already exists
        ).execute()
        total += len(batch)

    print(f"  {series_id}: upserted {total} chapters")
    return total


def upload_all():
    """Upload everything in chapter_data.json to Supabase."""
    if not CHAPTER_DATA_PATH.exists():
        print(f"chapter_data.json not found at {CHAPTER_DATA_PATH}")
        sys.exit(1)

    print(f"Reading {CHAPTER_DATA_PATH}...")
    with open(CHAPTER_DATA_PATH, "r", encoding="utf-8") as f:
        all_data = json.load(f)

    client = get_client()
    print(f"Uploading {len(all_data)} series to Supabase...\n")

    grand_total = 0
    for series_id, series_data in all_data.items():
        # Support both formats:
        #   { "series-id": { "chapters": { "1": [...] } } }   ← your current format
        #   { "series-id": { "1": [...] } }                   ← flat format
        if "chapters" in series_data and isinstance(series_data["chapters"], dict):
            chapters = series_data["chapters"]
        else:
            chapters = series_data

        grand_total += upload_series(series_id, chapters, client)

    print(f"\n✓ Done. Total chapters upserted: {grand_total}")


# ─────────────────────────────────────────────────────────────────────────────
# HOW TO INTEGRATE WITH main.py
# ─────────────────────────────────────────────────────────────────────────────
# At the bottom of your main.py, after save_data() / writing chapter_data.json:
#
#   from upload_to_supabase import upload_series, get_client
#
#   # Upload only the series that were just fetched (faster than uploading all)
#   supabase_client = get_client()
#   for series_id in updated_series_ids:
#       chapters = chapter_data[series_id]["chapters"]  # adjust key if needed
#       upload_series(series_id, chapters, supabase_client)
#
# This way every time main.py runs, new chapters go straight to Supabase.
# No git commit, no redeploy.
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Upload single series: python upload_to_supabase.py star-embracing-swordmaster
        series_id = sys.argv[1]
        with open(CHAPTER_DATA_PATH) as f:
            all_data = json.load(f)
        if series_id not in all_data:
            print(f"Series '{series_id}' not found in chapter_data.json")
            sys.exit(1)
        data = all_data[series_id]
        chapters = data.get("chapters", data)
        upload_series(series_id, chapters)
    else:
        upload_all()