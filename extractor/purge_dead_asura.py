#!/usr/bin/env python3
"""
Detects and removes series that contain old Asura dead domain URLs (asuracomic.net).

Good URL patterns to preserve:
  - cdn.asurascans.com/asura-images/chapters/

Usage:
    python purge_dead_asura.py --dry-run     # show what would be removed
    python purge_dead_asura.py               # actually remove them
"""

import json
import os
import sys

OUTPUT_FILE = "chapter_data.json"


def load():
    if not os.path.exists(OUTPUT_FILE):
        print(f"✗ {OUTPUT_FILE} not found")
        sys.exit(1)
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save(data):
    tmp = OUTPUT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, OUTPUT_FILE)


def is_dead_url(url: str) -> bool:
    """
    Returns True if the URL contains the old 'asuracomic.net' domain.
    """
    if not isinstance(url, str):
        return False

    # Target all old links containing asuracomic.net
    if "asuracomic.net" in url:
        return True

    return False


def check_series(series_id: str, series_data: dict) -> dict:
    """
    Check a series for dead URLs.
    Returns info dict with dead chapter count and sample URLs.
    """
    chapters = series_data.get("chapters", {})
    dead_chapters = []
    sample_dead_url = None

    for ch_id, pages in chapters.items():
        if not isinstance(pages, list):
            continue

        # Check pages — if any page has an old link, flag the chapter
        for url in pages:
            if is_dead_url(url):
                dead_chapters.append(ch_id)
                if not sample_dead_url:
                    sample_dead_url = url
                break  # Move to the next chapter once a dead link is found

    return {
        "total_chapters": len(chapters),
        "dead_chapters": len(dead_chapters),
        "sample_dead_url": sample_dead_url,
    }


def main():
    dry_run = "--dry-run" in sys.argv
    target_series = [a for a in sys.argv[1:] if not a.startswith("--")]

    data = load()
    print(f"Loaded {len(data)} total series\n")

    # Filter out other platforms explicitly, focus purely on tracking potential asura series
    asura_series = {
        k: v for k, v in data.items()
        if not k.startswith("mgeko__")
           and not k.startswith("vortex__")
           and not k.startswith("manhwazone__")
    }

    # If specific series IDs/names are given as command-line arguments, filter to those
    if target_series:
        asura_series = {
            k: v for k, v in asura_series.items()
            if any(t.lower() in k.lower() for t in target_series)
        }

    dead_series = []
    for series_id, series_data in sorted(asura_series.items()):
        info = check_series(series_id, series_data)
        if info["dead_chapters"] > 0:
            dead_series.append((series_id, info))

    if not dead_series:
        print("✓ No series with old asuracomic.net links found.")
        return

    print(f"Found {len(dead_series)} series containing 'asuracomic.net' links:\n")
    total_chapters = 0
    for series_id, info in dead_series:
        print(f"  {series_id}")
        print(f"    {info['dead_chapters']}/{info['total_chapters']} chapters affected by dead links")
        print(f"    Sample: {info['sample_dead_url']}")
        total_chapters += info['total_chapters']

    print(f"\nTotal: {len(dead_series)} series, ~{total_chapters} chapters affected to re-extract")

    if dry_run:
        print("\n[DRY RUN] — nothing removed. Run without --dry-run to apply.")
        return

    confirm = input(f"\nRemove all {len(dead_series)} series from {OUTPUT_FILE}? (y/n): ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    # Backup original before modifying
    backup = OUTPUT_FILE + ".bak"
    with open(backup, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Backup saved to {backup}")

    for series_id, info in dead_series:
        del data[series_id]
        print(f"  ✓ Removed {series_id} ({info['total_chapters']} chapters)")

    save(data)
    remaining = sum(len(v.get("chapters", {})) for v in data.values())
    print(f"\nDone. {len(data)} series remaining | {remaining} total chapters")
    print("\nNow re-extract the removed series using your main scraper!")


if __name__ == "__main__":
    main()