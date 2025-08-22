from typing import List, Optional
from fastapi import FastAPI
from pydantic import BaseModel
from rapidfuzz import fuzz
import requests
from bs4 import BeautifulSoup

from scrapers.weebcentral_scraper import WeebCentralScraper

app = FastAPI()
wc = WeebCentralScraper()

class BestMatchIn(BaseModel):
    title: str
    alt_titles: Optional[List[str]] = None
    limit: int = 40

class BestMatchOut(BaseModel):
    title: str
    url: str
    score: float
    source: str  # "weebcentral" | "mangapill"

# ---- Mangapill very-lightweight fallback ----
def mangapill_search(q: str, limit: int = 20):
    url = "https://mangapill.com/search"
    r = requests.get(url, params={"q": q}, timeout=20, headers={
        "User-Agent": "Mozilla/5.0"
    })
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    # Result anchors look like /manga/<id>/<slug>
    for a in soup.select('a[href^="/manga/"]'):
        href = a.get("href") or ""
        title = a.get_text(" ", strip=True) or ""
        if not title or "/chapter/" in href:
            continue
        out.append({"title": title, "url": f"https://mangapill.com{href}"})
        if len(out) >= limit:
            break
    return out

@app.post("/")
def search_best(body: BestMatchIn) -> Optional[BestMatchOut]:
    q_primary = (body.title or "").strip()
    queries = [q_primary] + [t.strip() for t in (body.alt_titles or []) if t and t.strip()]

    # 1) Try WeebCentral
    candidates = []
    seen = set()
    for q in queries:
        try:
            for r in wc.search(q, limit=body.limit):
                key = r["url"]
                if key in seen:
                    continue
                seen.add(key)
                candidates.append({"title": r["title"], "url": r["url"], "source": "weebcentral"})
        except Exception:
            pass

    # 2) Fallback to Mangapill if needed
    if not candidates:
        for q in queries:
            try:
                for r in mangapill_search(q, limit=body.limit):
                    key = r["url"]
                    if key in seen:
                        continue
                    seen.add(key)
                    candidates.append({"title": r["title"], "url": r["url"], "source": "mangapill"})
            except Exception:
                pass

    if not candidates:
        return None

    # Fuzzy pick the best against any input title
    best = None
    best_score = -1
    for c in candidates:
        scores = [fuzz.ratio(c["title"].lower(), q.lower()) for q in queries if q]
        score = max(scores) if scores else 0
        if score > best_score:
            best_score = score
            best = c

    return BestMatchOut(title=best["title"], url=best["url"], score=float(best_score), source=best["source"])
