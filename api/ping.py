from fastapi import FastAPI

app = FastAPI(root_path="/api/ping")

@app.get("/")
def ping():
    return {"ok": True, "service": "mangapill"}
