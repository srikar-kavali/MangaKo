"""Read-only cloud hydration and conservative chapter writes.

The cloud table is the authoritative source for existing chapters. This module
never deletes database rows or overwrites cloud data with stale local cache.
"""
import os


def get_supabase_client():
    try:
        from supabase import create_client
    except ImportError as error:
        raise RuntimeError("Install Python package: pip install supabase") from error
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def extract_chapters(entry):
    if not isinstance(entry, dict):
        return {}
    if isinstance(entry.get("chapters"), dict):
        return entry["chapters"]
    return entry


def valid_chapters(entry):
    if not isinstance(entry, dict):
        return {}
    return {
        str(chapter_id): pages for chapter_id, pages in entry.items()
        if isinstance(pages, list) and len(pages) > 0
        and all(isinstance(page, str) and page for page in pages)
    }


def fetch_cloud_chapters(client, page_size=500):
    """Read every chapter through Supabase pagination.

    An incomplete read raises an error rather than allowing stale local data
    to be used as the basis for scraping or overwriting cloud state.
    """
    catalog = {}
    start = 0
    while True:
        result = (client.table("chapters")
                  .select("series_id,chapter_id,pages")
                  .order("series_id")
                  .order("chapter_id")
                  .range(start, start + page_size - 1)
                  .execute())
        rows = result.data
        if not isinstance(rows, list):
            raise RuntimeError("Could not load chapter rows from Supabase")
        for row in rows:
            series_id = row.get("series_id")
            chapter_id = row.get("chapter_id")
            pages = row.get("pages")
            if not series_id or chapter_id is None:
                raise ValueError("Malformed cloud chapter identifier")
            if isinstance(pages, list) and pages:
                catalog.setdefault(str(series_id), {})[str(chapter_id)] = pages
        start += len(rows)
        if len(rows) < page_size:
            break
    return catalog


def hydrate_local_cache(client, local):
    """Merge downloaded cloud rows into existing cache without deleting local data."""
    remote = fetch_cloud_chapters(client)
    for series_id, chapters in remote.items():
        entry = local.get(series_id)
        if not isinstance(entry, dict):
            local[series_id] = {"chapters": dict(chapters)}
            continue
        if isinstance(entry.get("chapters"), dict):
            entry["chapters"].update(chapters)
        else:
            # Convert legacy flat format into current nested scraper schema.
            existing = valid_chapters(entry)
            existing.update(chapters)
            local[series_id] = {"chapters": existing}
    return remote


def upload_changed_chapters(client, series_id, chapters, batch_size=100):
    rows = [
        {"series_id": series_id, "chapter_id": cid, "pages": pages}
        for cid, pages in valid_chapters(chapters).items()
    ]
    for i in range(0, len(rows), batch_size):
        client.table("chapters").upsert(
            rows[i:i + batch_size], on_conflict="series_id,chapter_id"
        ).execute()
    return len(rows)
