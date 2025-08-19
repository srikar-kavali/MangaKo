# api/manga.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from scrapers.weebcentral_scraper import WeebCentralScraper, Manga as MangaDC

app = FastAPI(title="WeebCentral Manga", root_path="/api/manga")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

scraper = WeebCentralScraper()

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

@app.get("/")
def manga(id_or_url: str = Query(...)) -> Manga:
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
