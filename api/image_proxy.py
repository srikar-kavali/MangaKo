from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse, Response
import httpx
from io import BytesIO
from PIL import Image
import mimetypes
from fastapi.middleware.cors import CORSMiddleware
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Image Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEOUT = 30.0

# Create a persistent client
client = httpx.Client(timeout=TIMEOUT, follow_redirects=True)

@app.get("/")
async def proxy(url: str = Query(..., description="Absolute image URL")):
    logger.info(f"📥 Incoming request for URL: {url}")

    if not url.startswith("https://") and not url.startswith("http://"):
        logger.error(f"❌ Invalid URL scheme: {url}")
        raise HTTPException(400, "Only http/https URLs allowed.")

    # Determine referer based on URL
    if "asuracomic" in url or "gg.asuracomic" in url:
        referer = "https://asuracomic.net/"
    elif "mangapill" in url:
        referer = "https://mangapill.com/"
    else:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        referer = f"{parsed.scheme}://{parsed.netloc}/"

    logger.info(f"🔗 Using referer: {referer}")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": referer,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "image",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "cross-site",
    }

    try:
        logger.info(f"🌐 Fetching image from: {url}")
        r = client.get(url, headers=headers)
        logger.info(f"✅ Response status: {r.status_code}")
        logger.info(f"📊 Content-Type: {r.headers.get('content-type')}")
        logger.info(f"📦 Content-Length: {r.headers.get('content-length')} bytes")
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ HTTP error {e.response.status_code}: {e.response.text[:200]}")
        raise HTTPException(e.response.status_code, f"Upstream returned {e.response.status_code}")
    except httpx.HTTPError as e:
        logger.error(f"❌ Request error: {str(e)}")
        raise HTTPException(502, f"Upstream fetch failed: {str(e)}")

    ctype = r.headers.get("content-type", "").split(";")[0].strip()

    # If it's webp, transcode to PNG
    if ctype == "image/webp" or url.lower().endswith(".webp"):
        logger.info("🔄 Converting WebP to PNG...")
        try:
            img = Image.open(BytesIO(r.content)).convert("RGB")
            buf = BytesIO()
            img.save(buf, format="PNG", optimize=True)
            buf.seek(0)
            logger.info("✅ WebP conversion successful")
            return StreamingResponse(
                buf,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=86400"},
            )
        except Exception as e:
            logger.warning(f"⚠️ WebP conversion failed: {e}, returning original")
            return Response(
                content=r.content,
                media_type="image/webp",
                headers={"Cache-Control": "public, max-age=3600"},
            )

    # Non-webp: pass through
    logger.info(f"✅ Returning {ctype} image")
    return Response(
        content=r.content,
        media_type=ctype or mimetypes.guess_type(url)[0] or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )

@app.get("/health")
async def health():
    return {"status": "ok", "service": "image_proxy"}