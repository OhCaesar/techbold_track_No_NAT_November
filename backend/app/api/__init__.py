from fastapi import APIRouter

from .tickets.router import router as tickets_router

api_router = APIRouter(prefix="/api")
api_router.include_router(tickets_router)

__all__ = ["api_router"]
