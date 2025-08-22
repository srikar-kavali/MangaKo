from fastapi import FastAPI

app = FastAPI(title="mangapill-ping")

@app.get("/")
def ping():
    return {"ok": True, "service": "mangapill"}
