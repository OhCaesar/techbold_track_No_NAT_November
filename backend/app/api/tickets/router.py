"""Ticket API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ...erp.client import PhoenixClient, get_phoenix_client
from ...erp.exceptions import PhoenixAPIError
from ...erp.models import TicketStatus
from .schemas import TicketListResponse, TicketResponse

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get(
    "",
    response_model=TicketListResponse,
    summary="List tickets",
    description="Retrieve tickets from the ERP system, optionally filtered by status, priority, or sort order.",
)
async def list_tickets(
    status: TicketStatus | None = Query(None, description="Filter by ticket status"),
    priority: str | None = Query(None, description="Filter by priority level"),
    sort: str | None = Query(None, description="Sort order for results"),
    erp: PhoenixClient = Depends(get_phoenix_client),
) -> TicketListResponse:
    try:
        erp_tickets = await erp.list_tickets(
            status=status,
            priority=priority,
            sort=sort,
        )
    except PhoenixAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail)) from exc

    tickets = [TicketResponse.model_validate(t, from_attributes=True) for t in erp_tickets]
    return TicketListResponse(tickets=tickets, count=len(tickets))
