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
def proxy(url: str = Query(...)):
    if not url.startswith("http"):
        raise HTTPException(400, "Invalid URL")

    # Determine referer
    if "asuracomic" in url:
        referer = "https://asuracomic.net/"
    elif "mangapill" in url:
        referer = "https://mangapill.com/"
    else:
        referer = "https://google.com/"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": referer,
        "Accept": "image/*",
    }

    try:
        # Use shorter timeout for Vercel
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()

            return Response(
                content=r.content,
                media_type=r.headers.get("content-type", "image/jpeg"),
                headers={
                    "Cache-Control": "public, max-age=31536000",
                    "Access-Control-Allow-Origin": "*",
                }
            )
    except httpx.TimeoutException:
        raise HTTPException(504, "Image fetch timeout")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Fetch failed: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok"}
