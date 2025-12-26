from fastapi import FastAPI, HTTPException, Query
from scrapers.asura_scraper import AsuraComic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Asura Comic Search", root_path="/api/asurascans/search")
scraper = AsuraComic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-6o8goc2de-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def search(q: str = Query(...), page: int = Query(1)):  # ← Add page parameter
    try:
        result = scraper.search(q, page)  # ← Pass page to scraper
        if result["status"] == "error":  # ← Check for errors
            raise HTTPException(status_code=500, detail=result["results"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))