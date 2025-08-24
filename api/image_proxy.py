# api/image_proxy.py
from fastapi import FastAPI, HTTPException, Query, Response
import httpx

app = FastAPI(title="Image Proxy", root_path="/api/image")

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://mangapill.com/",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
}

client = httpx.Client(headers=BROWSER_HEADERS, timeout=30.0, follow_redirects=True)

@app.get("/")
def proxy(url: str = Query(...)):
    try:
        r = client.get(url)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}") from e

    # Pass through content-type; simple caching hint
    content_type = r.headers.get("content-type", "image/jpeg")
    return Response(content=r.content, media_type=content_type, headers={
        "Cache-Control": "public, max-age=86400"
    })
