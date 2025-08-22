# api/mangapill.py
from typing import List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Mangapill API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"ok": True, "service": "mangapill"}

@app.get("/ping")
def ping():
    return {"ok": True}

# stub search so we can test wiring even before the scraper
@app.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = 5) -> List[dict]:
    # return fake results to prove the route works
    return [{"id": "demo-1", "title": f"{q} (demo)", "url": "https://mangapill.com"}]
