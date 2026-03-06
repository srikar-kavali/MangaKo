import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="Debug", root_path="/api/asurascans/debug")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

PROXY = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
GG_BASE = "https://gg.asuracomic.net"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://asuracomic.net/",
    "Accept": "application/json, */*",
    "Origin": "https://asuracomic.net",
}

def proxy_get(url: str) -> tuple:
    proxied = f"{PROXY}{url}"
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        r = client.get(proxied, headers=HEADERS)
        return r.status_code, r.text[:1000]

@app.get("/")
def debug(
        series_id: str = Query(None),
        chapter_id: str = Query(None),
):
    if not series_id:
        return {"error": "provide series_id"}

    # Try every plausible API pattern on gg.asuracomic.net
    urls = [
        f"{GG_BASE}/api/series/{series_id}",
        f"{GG_BASE}/api/comics/{series_id}",
        f"{GG_BASE}/series/{series_id}",
        f"{GG_BASE}/api/v1/series/{series_id}",
        f"{GG_BASE}/api/v2/comics/{series_id}",
    ]

    if chapter_id:
        urls += [
            f"{GG_BASE}/api/series/{series_id}/chapters/{chapter_id}",
            f"{GG_BASE}/api/series/{series_id}/chapter/{chapter_id}",
            f"{GG_BASE}/api/chapters/{chapter_id}",
            f"{GG_BASE}/api/v1/chapters/{chapter_id}/images",
        ]

    results = {}
    for url in urls:
        status, preview = proxy_get(url)
        results[url] = {"status": status, "preview": preview}

    return results
