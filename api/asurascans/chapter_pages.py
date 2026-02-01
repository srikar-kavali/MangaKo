from fastapi import FastAPI, HTTPException, Query
from typing import List
from scrapers.asura_scraper import AsuraComic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Asura Chapter Pages", root_path="/api/asurascans/chapter_pages")
scraper = AsuraComic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",  # Expo web dev
        "http://localhost:3000",  # React web dev
        "https://manga-csn499ktv-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def chapter_pages(
        series_id: str = Query(..., description="Series ID (e.g., 'nano-machine-9cd9b21f')"),
        chapter_id: str = Query(..., description="Chapter ID (e.g., '1' or '232')")) -> dict:
    try:
        result = scraper.pages(series_id, chapter_id)
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result["results"])
        if not result["results"]:
            raise HTTPException(status_code=404, detail="No images found for the provided chapter.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
