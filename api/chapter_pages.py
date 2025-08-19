# api/chapter_pages.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from scrapers.weebcentral_scraper import WeebCentralScraper

app = FastAPI(title="WeebCentral Chapter Pages", root_path="/api/chapter_pages")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

scraper = WeebCentralScraper()

@app.get("/")
def chapter_pages(id_or_url: str = Query(...)) -> List[str]:
    try:
        return scraper.get_chapter_pages(id_or_url)
    except Exception as e:
        raise HTTPException(500, str(e))
