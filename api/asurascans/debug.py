import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
from bs4 import BeautifulSoup

app = FastAPI(title="Debug", root_path="/api/asurascans/debug")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

PROXY = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
BASE = "https://asuracomic.net"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://asuracomic.net/",
    "Accept": "application/json, text/html, */*",
}

def proxy_get(url: str) -> tuple:
    proxied = f"{PROXY}{url}"
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        r = client.get(proxied, headers=HEADERS)
        return r.content, r.status_code, r.text

@app.get("/")
def debug(
        series_id: str = Query(None),
        chapter_id: str = Query(None),
        mode: str = Query("html")  # html, api, chapter_api
):
    # Mode 1: Try their internal API endpoints
    if mode == "api" and series_id:
        # Try common Next.js App Router API patterns
        urls_to_try = [
            f"{BASE}/api/series/{series_id}",
            f"{BASE}/api/comic/{series_id}",
            f"{BASE}/api/comics/{series_id}",
        ]
        results = {}
        for url in urls_to_try:
            content, status, text = proxy_get(url)
            results[url] = {"status": status, "preview": text[:500]}
        return results

    # Mode 2: Try chapter API
    if mode == "chapter_api" and series_id and chapter_id:
        urls_to_try = [
            f"{BASE}/api/series/{series_id}/chapter/{chapter_id}",
            f"{BASE}/api/chapters/{series_id}/{chapter_id}",
            f"{BASE}/api/chapter/{chapter_id}",
        ]
        results = {}
        for url in urls_to_try:
            content, status, text = proxy_get(url)
            results[url] = {"status": status, "preview": text[:500]}
        return results

    # Mode 3 (default): Parse HTML and return ALL img tags + all script contents
    if chapter_id and series_id:
        url = f"{BASE}/series/{series_id}/chapter/{chapter_id}"
    elif series_id:
        url = f"{BASE}/series/{series_id}"
    else:
        return {"error": "provide series_id"}

    content, status, text = proxy_get(url)
    soup = BeautifulSoup(content, "html.parser")

    # Get all images
    all_imgs = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        alt = img.get("alt", "")
        cls = img.get("class", [])
        all_imgs.append({"src": src, "alt": alt, "class": cls})

    # Get all inline script contents (not src scripts)
    scripts = []
    for s in soup.find_all("script"):
        if not s.get("src") and s.string:
            scripts.append(s.string[:300])

    # Get all links with "chapter" in them
    chapter_links = []
    for a in soup.find_all("a", href=True):
        if "chapter" in a.get("href", "").lower():
            chapter_links.append(a.get("href"))

    return {
        "url": url,
        "status": status,
        "img_count": len(all_imgs),
        "imgs": all_imgs[:30],
        "chapter_links": chapter_links[:20],
        "inline_scripts_preview": scripts[:5],
        "html_length": len(text)
    }
