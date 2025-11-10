from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Manga", root_path="/api/manga")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-fszonint1-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def manga(url: str = Query(...)):
    try:
        return scraper.get_manga(url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))