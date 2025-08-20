from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from rapidfuzz import fuzz
from scrapers.weebcentral_scraper import WeebCentralScraper

class BestMatchIn(BaseModel):
    title: str
    alt_titles: Optional[List[str]] = None
    limit: int = 40

class BestMatchOut(BaseModel):
    title: str
    url: str
    score: float

app = FastAPI(title="WeebCentral API", root_path="/api/search-best")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
scraper = WeebCentralScraper()

@app.post("/")
def search_best(body: BestMatchIn) -> Optional[BestMatchOut]:
    title = (body.title or "").strip()
    alts = [t.strip() for t in (body.alt_titles or []) if t and t.strip()]
    queries = [title] + [t for t in alts if t.lower() != title.lower()]

    candidates = []
    seen = set()
    for q in queries:
        try:
            for r in scraper.search(q, limit=body.limit):
                if r["url"] in seen:
                    continue
                seen.add(r["url"])
                candidates.append(r)
        except Exception:
            continue

    if not candidates:
        return None

    best = max(
        candidates,
        key=lambda c: max(fuzz.ratio(c["title"].lower(), q.lower()) for q in queries if q),
    )
    best_score = max(fuzz.ratio(best["title"].lower(), q.lower()) for q in queries if q)
    return BestMatchOut(title=best["title"], url=best["url"], score=float(best_score))
