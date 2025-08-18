from fastapi import FastAPI

# IMPORTANT: tell FastAPI the base path Vercel will use
app = FastAPI(root_path="/api/ping")

@app.get("/")  # now this matches GET /api/ping
def ping():
    return {"ok": True}
