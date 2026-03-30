#!/usr/bin/env python3
import os
import certifi
from urllib.parse import urlparse
from shared.storage import load_data, save_data

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# =============================================
# ADD ALL YOUR MANHWA LINKS HERE
# =============================================
MANHWA_URLS = [
    # --- Asura Scans ---

    # --- Vortex Scans ---
    #"https://vortexscans.org/series/the-beginning-after-the-end",

    # --- ManhwaZone ---
    "https://manhwazone.to/series/eleceed-z0eq0",
]
# =============================================


def get_site(url):
    domain = urlparse(url).netloc
    if "vortexscans.org" in domain:
        return "vortex"
    if "asurascans.com" in domain or "asuracomic.net" in domain:
        return "asura"
    if "toongod.org" in domain:
        return "toongod"
    if "manhwazone.to" in domain or "manhwazone.com" in domain:
        return "manhwazone"
    return None


def main():
    print("=== Manhwa Extractor ===")
    print(f"Processing {len(MANHWA_URLS)} titles\n")

    data = load_data()
    print(f"Loaded existing data: {len(data)} series cached\n")

    for url in MANHWA_URLS:
        site = get_site(url)

        try:
            if site == "vortex":
                from sites.vortex import scrape
                scrape(url, data)

            elif site == "asura":
                from sites.asura import scrape
                scrape(url, data)

            elif site == "toongod":
                from sites.toongod import scrape
                scrape(url, data)

            elif site == "manhwazone":
                from sites.manhwazone import scrape
                scrape(url, data)

            else:
                print(f"  ✗ Unknown site for URL: {url}")

        except Exception as e:
            print(f"  ✗ Failed entirely: {e}")
            save_data(data)
            continue

    print(f"\n{'='*50}")
    print(f"All done! Data saved to chapter_data.json")
    total = sum(len(v["chapters"]) for v in data.values())
    print(f"Total series: {len(data)} | Total chapters: {total}")


if __name__ == "__main__":
    main()