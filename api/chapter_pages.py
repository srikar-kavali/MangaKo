from fastapi import FastAPI, HTTPException
from typing import List
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI()
scraper = MangapillScraper()


@app.get("/")
async def chapter_pages(url: str) -> List[str]:
    try:
        return await scraper.get_chapter_pages(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
