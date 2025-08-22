from fastapi import FastAPI, HTTPException, Query
from typing import List, Dict
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI()
scraper = MangapillScraper()

@app.get("/")
def search(q: str = Query(..., min_length=1), limit: int = 20) -> List[Dict]:
    try:
        return scraper.search(q, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
