import json
import os
import time
import threading

OUTPUT_FILE = "chapter_data.json"
_lock = threading.Lock()


def _try_repair_json(raw):
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


def load_data():
    if not os.path.exists(OUTPUT_FILE):
        return {}

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        raw = f.read()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  ⚠ chapter_data.json is corrupt (char {e.pos}): {e.msg}")
        print("  Attempting automatic repair...")

        backup = OUTPUT_FILE + ".bak"
        with open(backup, "w", encoding="utf-8") as f:
            f.write(raw)
        print(f"  Backup saved to {backup}")

        data = _try_repair_json(raw)
        if data:
            total = sum(len(v.get("chapters", {})) for v in data.values())
            print(f"  ✓ Repaired! Recovered {len(data)} series, {total} chapters")
            save_data(data)
            return data
        else:
            print("  ✗ Could not repair automatically. Starting fresh.")
            return {}


def save_data(data):
    with _lock:
        tmp = OUTPUT_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        for attempt in range(20):
            try:
                if os.path.exists(OUTPUT_FILE):
                    os.remove(OUTPUT_FILE)
                os.rename(tmp, OUTPUT_FILE)
                return
            except PermissionError:
                time.sleep(0.5 * (attempt + 1))  # grows: 0.5, 1.0, 1.5 ... up to 10s

        # Nuclear fallback — write directly without rename
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except:
                pass