"""Audit log API routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import AuditLog
from ...db.session import get_db
from .schemas import AuditLogListResponse, AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List audit logs",
    description=(
        "Retrieve SSH command audit logs stored in the database. "
        "Optionally filter by chat ID or ticket ID. Returns oldest-first (execution order)."
    ),
)
async def list_audit_logs(
    chat_id: uuid.UUID | None = Query(None, description="Filter by chat ID"),
    ticket_id: str | None = Query(None, description="Filter by ticket ID"),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    stmt = select(AuditLog).order_by(AuditLog.executed_at.asc())
    if chat_id is not None:
        stmt = stmt.where(AuditLog.chat_id == chat_id)
    if ticket_id is not None:
        stmt = stmt.where(AuditLog.ticket_id == ticket_id)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return AuditLogListResponse(
        audit_logs=[AuditLogResponse.model_validate(log, from_attributes=True) for log in logs],
        count=len(logs),
    )
