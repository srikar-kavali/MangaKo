#!/usr/bin/env python3
"""
Remove one or more series from chapter_data.json by ID or partial name match.

Usage:
    python cleanup.py eleceed
    python cleanup.py "solo-leveling" "nano-machine"
    python cleanup.py --list
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


def list_series(data):
    print(f"\n{len(data)} series in {OUTPUT_FILE}:\n")
    for key, val in sorted(data.items()):
        ch_count = len(val.get("chapters", {}))
        print(f"  {key}  ({ch_count} chapters)")
    print()


def remove(data, queries):
    removed = []
    for query in queries:
        query_lower = query.lower()
        matches = [k for k in data if query_lower in k.lower()]

        if not matches:
            print(f"  ✗ No match for '{query}'")
            continue

        if len(matches) > 1:
            print(f"  ⚠ '{query}' matches multiple keys:")
            for m in matches:
                print(f"      {m}")
            confirm = input("  Remove ALL of these? (y/n): ").strip().lower()
            if confirm != "y":
                print("  Skipped.")
                continue

        for key in matches:
            ch_count = len(data[key].get("chapters", {}))
            del data[key]
            removed.append(key)
            print(f"  ✓ Removed '{key}' ({ch_count} chapters)")

    return removed


def main():
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        sys.exit(0)

    data = load()

    if args[0] == "--list":
        list_series(data)
        sys.exit(0)

    print(f"\nLoaded {len(data)} series from {OUTPUT_FILE}\n")

    # Backup before modifying
    backup = OUTPUT_FILE + ".bak"
    with open(backup, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Backup saved to {backup}\n")

    removed = remove(data, args)

    if removed:
        save(data)
        total = sum(len(v.get("chapters", {})) for v in data.values())
        print(f"\nDone. {len(data)} series remaining | {total} total chapters")
    else:
        print("\nNothing removed.")


if __name__ == "__main__":
    main()