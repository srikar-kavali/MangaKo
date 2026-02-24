import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, HTTPException, Query
from scrapers.asura_scraper import AsuraComic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Asura Comic Search", root_path="/api/asurascans/search")
scraper = AsuraComic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def search(q: str = Query(...), page: int = Query(1)):
    try:
        result = scraper.search(q, page)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("results", "Search failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))