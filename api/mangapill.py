# api/mangapill.py
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Mangapill API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

scraper = MangapillScraper()


@app.get("/")  # <— add this
async def root():
    return {"ok": True, "service": "mangapill"}


@app.get("/ping")
async def ping():
    return {"ok": True, "service": "mangapill"}


@app.get("/search")
async def search(q: str = Query(..., min_length=1), limit: int = 20):
    try:
        return await scraper.search(q, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/manga")
async def manga(url: str):
    return await scraper.get_manga(url)


@app.get("/chapter/pages")
async def chapter_pages(url: str) -> List[str]:
    return await scraper.get_chapter_pages(url)
