from fastapi import FastAPI

app = FastAPI()

@app.get("/")  # URL will be /api/ping (no double "ping")
def ping():
    return {"ok": True}
