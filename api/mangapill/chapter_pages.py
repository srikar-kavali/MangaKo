import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, HTTPException, Query
from typing import List
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Chapter Pages", root_path="/api/mangapill/chapter_pages")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        raise HTTPException(status_code=400, detail=f"Invalid chapter or no images: {str(ve)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
