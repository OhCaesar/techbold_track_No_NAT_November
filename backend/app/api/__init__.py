from fastapi import APIRouter

from .audit_logs.router import router as audit_logs_router
from .chats.router import router as chats_router
from .customers.router import router as customers_router
from .tickets.router import router as tickets_router

api_router = APIRouter(prefix="/api")
api_router.include_router(tickets_router)
api_router.include_router(chats_router)
api_router.include_router(customers_router)
api_router.include_router(audit_logs_router)

__all__ = ["api_router"]
