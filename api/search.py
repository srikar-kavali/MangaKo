from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Mangapill Search", root_path="/api/search")
scraper = MangapillScraper()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-e4eeiz92a-srikar-kavalis-projects.vercel.app",  # deployed backend
        "https://manga-e4eeiz92a-srikar-kavalis-projects.vercel.app",  # your deployed frontend (if different)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/search")
def search(q: str = Query(...)):
    try:
        return scraper.search(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
