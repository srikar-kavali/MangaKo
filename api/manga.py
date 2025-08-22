from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI()
scraper = MangapillScraper()

@app.get("/")
def manga(url: str = Query(...)):
    try:
        return scraper.get_manga(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
