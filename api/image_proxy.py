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

@app.get("/")
@app.get("/api/image_proxy")
def proxy(url: str = Query(...)):
    if not url.startswith("http"):
        raise HTTPException(400, "Invalid URL")

    # Determine referer
    if "readdetectiveconan.com" in url or "mangapill" in url:
        referer = "https://mangapill.com/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": referer,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "image",
            "sec-fetch-mode": "no-cors",
            "sec-fetch-site": "cross-site",
        }
    elif "asuracomic" in url:
        referer = "https://asuracomic.net/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": referer,
            "Accept": "image/*",
        }
    else:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/*",
        }

    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()

            # Get content type, default to jpeg
            content_type = r.headers.get("content-type", "image/jpeg")
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"

            # Critical headers for React Native
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
    """Handle CORS preflight requests"""
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
