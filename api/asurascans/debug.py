import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
import json
from bs4 import BeautifulSoup

app = FastAPI(title="Debug", root_path="/api/asurascans/debug")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PROXY = "https://sup-proxy.zephex0-f6c.workers.dev/api-text?url="
BASE = "https://asuracomic.net"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

@app.get("/")
def debug(
        series_id: str = Query(None),
        chapter_id: str = Query(None)
):
    if chapter_id and series_id:
        url = f"{BASE}/series/{series_id}/chapter/{chapter_id}"
    elif series_id:
        url = f"{BASE}/series/{series_id}"
    else:
        return {"error": "provide series_id and/or chapter_id"}

    proxied = f"{PROXY}{url}"
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        r = client.get(proxied, headers=HEADERS)
        soup = BeautifulSoup(r.content, "html.parser")

    script = soup.find("script", id="__NEXT_DATA__")
    if not script:
        # Return first 3000 chars of HTML so we can see what we got
        return {
            "next_data": None,
            "html_preview": r.text[:3000],
            "status_code": r.status_code,
            "url_fetched": url
        }

    try:
        data = json.loads(script.string)
        props = data.get("props", {}).get("pageProps", {})
        # Return the keys at each level so we know the structure
        return {
            "url_fetched": url,
            "pageProps_keys": list(props.keys()),
            "comic_keys": list(props.get("comic", {}).keys()) if props.get("comic") else None,
            "series_keys": list(props.get("series", {}).keys()) if props.get("series") else None,
            "chapter_keys": list(props.get("chapter", {}).keys()) if props.get("chapter") else None,
            "raw_sample": {
                k: str(v)[:200] for k, v in props.items()
            }
        }
    except Exception as e:
        return {"parse_error": str(e), "raw": script.string[:2000]}
