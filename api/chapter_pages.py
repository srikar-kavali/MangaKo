from fastapi import FastAPI, HTTPException, Query
from typing import List
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Chapter Pages", root_path="/api/chapter_pages")
scraper = MangapillScraper()

@app.get("/")
def chapter_pages(url: str = Query(...)) -> List[str]:
    try:
        return scraper.get_chapter_pages(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
