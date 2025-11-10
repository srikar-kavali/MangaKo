from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Mangapill Search", root_path="/api/mangapill/search")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-aj70k9xep-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def search(q: str = Query(...)):
    try:
        return scraper.search(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
