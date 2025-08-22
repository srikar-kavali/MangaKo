from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/")
def ping():
    return {"ok": True, "service": "mangapill"}

# Vercel handler
def handler(request):
    from mangum import Mangum
    asgi_handler = Mangum(app)
    return asgi_handler(request.scope, request.receive, request.send)