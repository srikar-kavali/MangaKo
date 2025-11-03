#api
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from typing import List, Dict
from scrapers.mangapill_scraper import MangapillScraper
import traceback

app = FastAPI(title="Search", root_path="/api/search")

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
def search(q: str = Query(..., min_length=1), limit: int = 20) -> List[Dict]:
    try:
        return scraper.search(q, limit)
    except Exception as e:
        print("Error in /api/search:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))