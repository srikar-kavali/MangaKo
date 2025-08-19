# api/search.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
from scrapers.weebcentral_scraper import WeebCentralScraper

app = FastAPI(title="WeebCentral Search", root_path="/api/search")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

scraper = WeebCentralScraper()

@app.get("/")
def search(q: str = Query(..., min_length=1), limit: int = 20) -> List[Dict[str, str]]:
    try:
        return scraper.search(q, limit=limit)
    except Exception as e:
        raise HTTPException(500, str(e))
