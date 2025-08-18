# manga_api/index.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# import your scraper
from scrapers.weebcentral_scraper import WeebCentralScraper, Chapter as ChapterDC, Manga as MangaDC

app = FastAPI(title="WeebCentral API (Vercel)")
scraper = WeebCentralScraper()

# --- CORS so Expo can call it from anywhere ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # tighten later if you want
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models for responses ---
class SearchItem(BaseModel):
    id: str
    title: str
    url: str

class Chapter(BaseModel):
    id: str
    number: str
    title: Optional[str] = None
    url: str
    updated: Optional[str] = None

class Manga(BaseModel):
    id: str
    title: str
    url: str
    alt_titles: List[str]
    authors: List[str]
    artists: List[str]
    status: Optional[str]
    tags: List[str]
    description: Optional[str]
    cover_url: Optional[str]
    chapters: List[Chapter]

# --- Routes ---
@app.get("/manga_api/search", response_model=List[SearchItem])
def search(q: str = Query(..., min_length=1), limit: int = 20):
    try:
        return scraper.search(q, limit=limit)
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/manga_api/manga", response_model=Manga)
def manga(id_or_url: str):
    try:
        m: MangaDC = scraper.get_manga(id_or_url)
        return Manga(
            id=m.id, title=m.title, url=m.url, alt_titles=m.alt_titles,
            authors=m.authors, artists=m.artists, status=m.status, tags=m.tags,
            description=m.description, cover_url=m.cover_url,
            chapters=[Chapter(**c.__dict__) for c in m.chapters],
        )
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/manga_api/chapter/pages", response_model=List[str])
def chapter_pages(id_or_url: str):
    try:
        return scraper.get_chapter_pages(id_or_url)
    except Exception as e:
        raise HTTPException(500, str(e))
