# api/mangapill.py
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Mangapill API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

scraper = MangapillScraper()

@app.get("/")  # <--- add this
def root():
    return {"ok": True, "service": "mangapill"}

@app.get("/ping")
def ping():
    return {"ok": True, "service": "mangapill"}

@app.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = 20):
    try:
        return scraper.search(q, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
