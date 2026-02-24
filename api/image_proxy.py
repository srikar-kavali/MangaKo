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

    # Specific headers for MangaPill's CDN
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
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()

            return Response(
                content=r.content,
                media_type=r.headers.get("content-type", "image/jpeg"),
                headers={
                    "Cache-Control": "public, max-age=31536000",
                    "Access-Control-Allow-Origin": "*",
                    "Content-Length": str(len(r.content)),
                }
            )
    except httpx.TimeoutException:
        raise HTTPException(504, "Timeout")
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Error {e.response.status_code}")
    except Exception as e:
        raise HTTPException(502, str(e))

@app.get("/health")
def health():
    return {"status": "ok"}
