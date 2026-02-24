from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
import httpx
from io import BytesIO
from PIL import Image
import mimetypes
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Image Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIMEOUT = 30.0

@app.get("/")
def proxy(url: str = Query(..., description="Absolute image URL")):
    logger.info(f"📥 Proxying: {url}")

    if not url.startswith("https://") and not url.startswith("http://"):
        logger.error(f"❌ Invalid URL: {url}")
        raise HTTPException(400, "Only http/https URLs allowed.")

    # Determine referer
    if "asuracomic" in url or "gg.asuracomic" in url:
        referer = "https://asuracomic.net/"
    elif "mangapill" in url:
        referer = "https://mangapill.com/"
    else:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        referer = f"{parsed.scheme}://{parsed.netloc}/"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": referer,
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        with httpx.Client(timeout=TIMEOUT, headers=headers, follow_redirects=True) as client:
            r = client.get(url)
            logger.info(f"✅ Status: {r.status_code}")
            r.raise_for_status()

            ctype = r.headers.get("content-type", "").split(";")[0].strip()

            # Convert WebP to PNG for compatibility
            if ctype == "image/webp" or url.lower().endswith(".webp"):
                try:
                    img = Image.open(BytesIO(r.content)).convert("RGB")
                    buf = BytesIO()
                    img.save(buf, format="PNG", optimize=True)
                    return Response(
                        content=buf.getvalue(),
                        media_type="image/png",
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*"
                        }
                    )
                except Exception as e:
                    logger.warning(f"⚠️ WebP conversion failed: {e}")

            # Return original
            return Response(
                content=r.content,
                media_type=ctype or "image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*"
                }
            )

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ HTTP {e.response.status_code}")
        raise HTTPException(e.response.status_code, f"Upstream error: {e.response.status_code}")
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        raise HTTPException(502, f"Fetch failed: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok", "service": "image_proxy"}