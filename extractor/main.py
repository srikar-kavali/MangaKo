#!/usr/bin/env python3
import os
import certifi
from urllib.parse import urlparse
from extractor.shared import load_data, save_data

os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

# =============================================
# ADD ALL YOUR MANHWA LINKS HERE
# =============================================
MANHWA_URLS = [
    # --- Asura Scans ---
    #"https://asurascans.com/comics/after-the-moonlight-falls-trial-0984835a",
    #"https://asurascans.com/comics/the-regressed-son-of-a-duke-is-an-assassin-0984835a",
    "https://asurascans.com/comics/sandmancer-of-the-scorched-desert-0984835a",
    "https://asurascans.com/comics/the-regressed-mercenarys-machinations-0984835a",
    #"https://asurascans.com/comics/murim-psychopath-0984835a",
    #"https://asurascans.com/comics/pick-me-up-infinite-gacha-0984835a",

    # --- Vortex Scans ---
    #"https://vortexscans.org/series/player-s7gyl3nz",
    #"https://vortexscans.org/series/the-beginning-after-the-end",
    #"https://vortexscans.org/series/mercenary-enrollment-148la7eq",
    #"https://vortexscans.org/series/absolute-domination",
    #"https://vortexscans.org/series/regressing-as-the-reincarnated-bastard",

    # --- ManhwaZone ---
    # "https://manhwazone.to/series/eleceed-z0wqg",

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
    if "vortexscans.org" in domain:
        return "vortex"
    if "asurascans.com" in domain or "asuracomic.net" in domain:
        return "asura"
    if "manhwazone.to" in domain or "manhwazone.com" in domain:
        return "manhwazone"
    if "mgeko.cc" in domain:
        return "mgeko"
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
                from extractor.sites import scrape
                scrape(url, data)

            elif site == "asura":
                from extractor.sites.asura import scrape
                scrape(url, data)

            elif site == "manhwazone":
                from extractor.sites.manhwazone import scrape
                scrape(url, data)

            elif site == "mgeko":
                from extractor.sites.mgeko import scrape
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