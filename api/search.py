from fastapi import FastAPI, HTTPException, Query
from scrapers.mangapill_scraper import MangapillScraper
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Mangapill Search", root_path="/api/search")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://localhost:3000",
        "https://manga-8jrq7kyow-srikar-kavalis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


scraper = MangapillScraper()

@app.get("/search")
def search(q: str = Query(...)):
    try:
        result = scraper.search(q)
        #return scraper.search(q)
        response = JSONResponse(content=result)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
