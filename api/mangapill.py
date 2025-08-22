# api/mangapill.py
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# your scraper
from scrapers.mangapill_scraper import MangapillScraper, Chapter as ChapterDC, Manga as MangaDC

app = FastAPI(title="Mangapill API")
scraper = MangapillScraper()

# CORS (Expo-friendly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
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
    alt_titles: List[str] = []
    authors: List[str] = []
    artists: List[str] = []
    status: Optional[str] = None
    tags: List[str] = []
    description: Optional[str] = None
    cover_url: Optional[str] = None
    chapters: List[Chapter] = []

# ---------- Health ----------
@app.get("/ping")
def ping():
    return {"ok": True}

@app.get("/")
def root():
    return {"service": "mangapill-api", "ok": True}

# ---------- Search ----------
@app.get("/search", response_model=List[SearchItem])
def search(q: str = Query(..., min_length=1), limit: int = 20):
    try:
        return scraper.search(q, limit=limit)
    except Exception as e:
        raise HTTPException(500, str(e))

# ---------- Manga details (incl. chapters) ----------
@app.get("/manga", response_model=Manga)
def manga(url: str = Query(..., description="Full Mangapill series URL or id/slug")):
    try:
        m: MangaDC = scraper.get_manga(url)
        return Manga(
            id=m.id,
            title=m.title,
            url=m.url,
            alt_titles=m.alt_titles,
            authors=m.authors,
            artists=m.artists,
            status=m.status,
            tags=m.tags,
            description=m.description,
            cover_url=m.cover_url,
            chapters=[Chapter(**c.__dict__) for c in m.chapters],
        )
    except Exception as e:
        raise HTTPException(500, str(e))

# ---------- Reader pages ----------
@app.get("/chapter/pages", response_model=List[str])
def chapter_pages(url: str = Query(..., description="Full Mangapill chapter URL or id/slug")):
    try:
        return scraper.get_chapter_pages(url)
    except Exception as e:
        raise HTTPException(500, str(e))
