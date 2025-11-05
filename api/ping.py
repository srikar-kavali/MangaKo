from fastapi import FastAPI

app = FastAPI(title="Ping", root_path="/api/ping")

@app.get("/")
def ping():
    return {"ok": True, "service": "mangapill"}


