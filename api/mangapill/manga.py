import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Manga", root_path="/api/mangapill/manga")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def manga(url: str = Query(...)):
    try:
        result = scraper.get_manga(url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))