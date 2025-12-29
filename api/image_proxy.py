from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
import httpx
from io import BytesIO
from PIL import Image  # pillow
import mimetypes
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Image Proxy", root_path="/api/image_proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-58deqchm7-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEOUT = 30.0
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": "https://mangapill.com/",
}

client = httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True)

@app.get("/")
def proxy(url: str = Query(..., description="Absolute image URL")):
    # Basic allow-list
    if not url.startswith("https://"):
        raise HTTPException(400, "Only https URLs allowed.")

    try:
        r = client.get(url)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Upstream fetch failed: {e}")

    ctype = r.headers.get("content-type", "").split(";")[0].strip()

    # If it's webp, transcode to PNG (or JPEG)
    if ctype == "image/webp" or url.lower().endswith(".webp"):
        try:
            img = Image.open(BytesIO(r.content)).convert("RGB")
            buf = BytesIO()
            # PNG is safest; switch to JPEG if you prefer smaller
            img.save(buf, format="PNG", optimize=True)
            buf.seek(0)
            return StreamingResponse(
                buf,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        except Exception as e:
            # If transcode fails, fall back to original bytes
            return Response(
                content=r.content,
                media_type="image/webp",
                headers={"Cache-Control": "public, max-age=3600"},
            )

    # Non-webp → stream through
    return Response(
        content=r.content,
        media_type=ctype or mimetypes.guess_type(url)[0] or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )