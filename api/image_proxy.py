from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
import httpx
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_headers(url: str) -> dict:
    base = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "cross-site",
    }

    if "readdetectiveconan.com" in url or "mangapill" in url:
        return {**base, "Referer": "https://mangapill.com/",
                "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120"',
                "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"'}

    if "asuracomic" in url:
        return {**base, "Referer": "https://asuracomic.net/"}

    # ToonGod CDN — blocks without toongod.org referer
    if "tngcdn.com" in url:
        return {**base, "Referer": "https://www.toongod.org/"}

    # Vortex Scans CDN
    if "vexmanga.com" in url:
        return {**base, "Referer": "https://vortexscans.org/"}

    # ManhwaZone CDN
    if "manhwatop.com" in url:
        return {**base, "Referer": "https://manhwazone.to/"}

    # Generic fallback — no referer
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/*",
    }


@app.get("/")
@app.get("/api/image_proxy")
def proxy(url: str = Query(...)):
    if not url.startswith("http"):
        raise HTTPException(400, "Invalid URL")

    headers = get_headers(url)

    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()

            content_type = r.headers.get("content-type", "image/jpeg")
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"

            response_headers = {
                "Content-Type": content_type,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Content-Length": str(len(r.content)),
            }

            return Response(
                content=r.content,
                media_type=content_type,
                headers=response_headers,
                status_code=200
            )

    except httpx.TimeoutException:
        raise HTTPException(504, "Timeout fetching image")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Upstream error: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(502, f"Failed: {str(e)}")


@app.options("/")
@app.options("/api/image_proxy")
def proxy_options():
    return Response(
        content="",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600",
        }
    )


@app.get("/health")
def health():
    return {"status": "ok"}