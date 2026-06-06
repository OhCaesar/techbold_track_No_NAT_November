"""FastAPI entrypoint.

Keep the ERP token and the SSH key on the backend — never in the browser.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.session import init_db


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


# TODO: add your routes. A typical shape (yours may differ):
#   GET  /api/tickets              -> list tickets (via your Phoenix client)
#   GET  /api/tickets/{id}         -> ticket + customer system
#   POST /api/runs                 -> start an agent troubleshooting run
#   POST /api/runs/{id}/approve    -> run the approved command over SSH
#   POST /api/runs/{id}/activity   -> submit the activity to the ERP
