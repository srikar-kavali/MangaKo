#api
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi import FastAPI, HTTPException, Query
from typing import List
from scrapers.mangapill_scraper import MangapillScraper
import traceback

app = FastAPI(title="Chapter Pages", root_path="/api/chapter_pages")

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
def chapter_pages(url: str = Query(...)):
    try:
        return scraper.get_chapter_pages(url)
    except Exception as e:
        print("Error in /api/chapter_pages:", e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

