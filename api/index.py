# api/index.py
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rapidfuzz import fuzz

from scrapers.weebcentral_scraper import WeebCentralScraper, Manga as MangaDC, Chapter as ChapterDC

app = FastAPI(title="WeebCentral API")
scraper = WeebCentralScraper()

# CORS for your Expo app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
class BestMatchIn(BaseModel):
    title: str
    alt_titles: Optional[List[str]] = None
    limit: int = 40  # breadth when we search WC

class BestMatchOut(BaseModel):
    title: str
    url: str
    score: float

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

# ---------- Health ----------
@app.get("/ping")
def ping():
    return {"ok": True}

@app.get("/")
def root():
    return {"service": "weebcentral-api", "ok": True}

# ---------- Simple search passthrough (optional helper) ----------
@app.get("/search", response_model=List[SearchItem])
def search(q: str = Query(..., min_length=1), limit: int = 20):
    try:
        return scraper.search(q, limit=limit)
    except Exception as e:
        raise HTTPException(500, str(e))

# ---------- “Best match” search (use this from the app) ----------
@app.post("/search-best", response_model=Optional[BestMatchOut])
def search_best(body: BestMatchIn):
    """
    Tries search with main + alt titles, then chooses the best WeebCentral hit
    via fuzzy matching.
    """
    title = (body.title or "").strip()
    alts = [t.strip() for t in (body.alt_titles or []) if t and t.strip()]
    queries = [title] + [t for t in alts if t.lower() != title.lower()]

    candidates: List[SearchItem] = []
    seen = set()

    # gather candidates from multiple queries
    for q in queries:
        try:
            results = scraper.search(q, limit=body.limit)
            for r in results:
                key = r["url"]
                if key in seen:
                    continue
                seen.add(key)
                candidates.append(SearchItem(**r))
        except Exception:
            # ignore one bad query and try the next
            continue

    if not candidates:
        return None

    # score by fuzzy similarity against any of the input titles
    best = None
    best_score = -1.0
    for c in candidates:
        scores = [fuzz.ratio(c.title.lower(), q.lower()) for q in queries if q]
        score = max(scores) if scores else 0
        if score > best_score:
            best_score = score
            best = c

    if not best:
        return None

    return BestMatchOut(title=best.title, url=best.url, score=float(best_score))

# ---------- Full manga (if you want it) ----------
@app.get("/manga", response_model=Manga)
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

# ---------- Chapter pages ----------
@app.get("/chapter/pages", response_model=List[str])
def chapter_pages(id_or_url: str):
    try:
        return scraper.get_chapter_pages(id_or_url)
    except Exception as e:
        raise HTTPException(500, str(e))
