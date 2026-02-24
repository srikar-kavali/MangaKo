import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..'))

from fastapi import FastAPI, HTTPException, Query
from scrapers.asura_scraper import AsuraComic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Asura Manga", root_path="/api/asurascans/manga")
scraper = AsuraComic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def manga_info(series_id: str = Query(..., description="Series ID from search results")):
    try:
        result = scraper.info(series_id)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("results", "Failed to get manga info"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))