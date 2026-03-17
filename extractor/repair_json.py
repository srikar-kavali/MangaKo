#!/usr/bin/env python3
"""
Repairs a broken chapter_data.json by truncating at the last valid entry.
Run this once to fix the file, then run asura_extractor.py normally.
"""
import json
import sys
import os

INPUT_FILE = "chapter_data.json"
BACKUP_FILE = "chapter_data.json.bak"

def repair_json(filepath):
    print(f"Reading {filepath}...")
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()

    # First, try to parse as-is
    try:
        data = json.loads(raw)
        print("JSON is valid! No repair needed.")
        return data
    except json.JSONDecodeError as e:
        print(f"JSON error at char {e.pos}: {e.msg}")
        print("Attempting repair...")

    # Strategy: try progressively shorter strings until we get valid JSON
    # Find the error position and work backwards to last clean closing brace
    pos = len(raw)
    while pos > 0:
        pos -= 1
        # Look for a closing structure
        snippet = raw[:pos].rstrip()
        # Try adding closing braces to make it valid
        for suffix in ["}}}", "}}", "}", ""]:
            candidate = snippet + suffix
            try:
                data = json.loads(candidate)
                print(f"Repaired by truncating to position {pos} and adding '{suffix}'")
                return data
            except:
                continue

    print("Could not repair automatically.")
    return None

if __name__ == "__main__":
    if not os.path.exists(INPUT_FILE):
        print(f"No {INPUT_FILE} found.")
        sys.exit(1)

    # Backup first
    import shutil
    shutil.copy(INPUT_FILE, BACKUP_FILE)
    print(f"Backed up to {BACKUP_FILE}")

    data = repair_json(INPUT_FILE)
    if data:
        with open(INPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"\nSaved repaired JSON to {INPUT_FILE}")
        total = sum(len(v.get("chapters", {})) for v in data.values())
        print(f"Series: {len(data)} | Total chapters: {total}")
    else:
        print("Repair failed. Your backup is at chapter_data.json.bak")
        sys.exit(1)