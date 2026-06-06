"""FastAPI entrypoint.

Keep the ERP token and the SSH key on the backend — never in the browser.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import api_router
from .db.session import init_db
import app.db.models  # noqa: F401 — registers ORM models with Base.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="techbold AI Service Desk Autopilot — Team Backend",
    lifespan=lifespan,
)

# Open CORS for local dev so your React app can call this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_router)

