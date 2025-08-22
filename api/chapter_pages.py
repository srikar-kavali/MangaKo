from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="mangapill-chapter-pages")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

scraper = MangapillScraper()

@app.get("/")
def chapter_pages(id_or_url: str = Query(..., min_length=1)) -> List[str]:
    try:
        return scraper.get_chapter_pages(id_or_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
