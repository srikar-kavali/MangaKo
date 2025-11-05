from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Mangapill Search", root_path="/api/search")
scraper = MangapillScraper()

@app.get("/search")
def search(q: str = Query(...)):
    try:
        return scraper.search(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
