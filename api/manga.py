#api
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from scrapers.mangapill_scraper import MangapillScraper

app = FastAPI(title="Manga", root_path="/api/manga")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "http://localhost:3000",
        "http://localhost:8081",
        "https://manga-6h3txymbl-srikar-kavalis-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scraper = MangapillScraper()

@app.options("/")
def options_handler():
    response = Response()
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.get("/")
def manga(url: str = Query(...)):
    try:
        result = scraper.get_manga(url)
        response = JSONResponse(content=result)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))