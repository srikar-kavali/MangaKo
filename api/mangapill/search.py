import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Mangapill Search", root_path="/api/mangapill/search")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def search(q: str = Query(...), limit: int = Query(20)):
    try:
        results = scraper.search(q, limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
