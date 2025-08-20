# api/index.py
from fastapi import FastAPI
from scrapers.weebcentral_scraper import WeebCentralScraper, Chapter as ChapterDC, Manga as MangaDC

app = FastAPI(title="WeebCentral API (Vercel)", root_path="/api/index")
scraper = WeebCentralScraper()

@app.get("/")
@app.get("")  # support both /api/index and /api/index/
def root():
    return {"service": "weebcentral-api", "ok": True}
