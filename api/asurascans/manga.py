from fastapi import FastAPI, HTTPException, Query
from scrapers.asura_scraper import AsuraComic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Asura Manga", root_path="/api/asurascans/manga")
scraper = AsuraComic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-of059owkd-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def manga_info(series_id: str = Query(..., description="Series ID from search results")):
    """Get detailed manga information including chapters"""
    try:
        result = scraper.info(series_id)  # ← Changed from get_manga(url)
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result["results"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))