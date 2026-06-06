from fastapi import APIRouter

from .chats.router import router as chats_router
from .tickets.router import router as tickets_router

api_router = APIRouter(prefix="/api")
api_router.include_router(tickets_router)
api_router.include_router(chats_router)

__all__ = ["api_router"]
