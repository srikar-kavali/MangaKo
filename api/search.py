from fastapi import FastAPI, HTTPException, Query
from typing import List, Dict, Any
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Search")
scraper = MangapillScraper()

@app.get("/")
def search_manga(q: str = Query(..., description="Search query")) -> List[Dict[str, Any]]:
    """
    Perform a live manga search by query string.
    Returns a list of manga with titles, URLs, and cover images.
    """
    try:
        results = scraper.search(q)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")
