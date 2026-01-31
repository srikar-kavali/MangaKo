from fastapi import FastAPI, HTTPException, Query
from typing import List
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Chapter Pages", root_path="/api/mangapill/chapter_pages")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-nrre5wxuc-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def chapter_pages(url: str = Query(..., description="Full Mangapill chapter URL")) -> List[str]:
    try:
        pages = scraper.get_chapter_pages(url)
        if not pages:
            raise HTTPException(status_code=404, detail="No images found for the provided chapter.")
        return pages

    except ValueError as ve:
        # Known logical error (no images, invalid URL, etc.)
        raise HTTPException(status_code=400, detail=f"Invalid chapter or no images: {str(ve)}")

    except Exception as e:
        # Unexpected server-side error
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
