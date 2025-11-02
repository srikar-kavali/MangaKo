#api
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Query
from typing import List, Dict
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Search", root_path="/api/search")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "http://localhost:3000",
        "http://localhost:8081",
        "https://manga-6h3txymbl-srikar-kavalis-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def search(q: str = Query(..., min_length=1), limit: int = 20) -> List[Dict]:
    try:
        return scraper.search(q, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
