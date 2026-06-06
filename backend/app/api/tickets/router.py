"""Ticket API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ...erp.client import PhoenixClient, get_phoenix_client
from ...erp.exceptions import PhoenixAPIError
from ...erp.models import TicketStatus
from .schemas import StatusUpdateRequest, TicketListResponse, TicketResponse

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


@router.patch(
    "/{ticket_id}/status",
    response_model=TicketResponse,
    summary="Set ticket status",
    description="Update the status of a ticket in the ERP system (OPEN, PENDING, or DONE).",
)
async def set_ticket_status(
    ticket_id: int,
    body: StatusUpdateRequest,
    erp: PhoenixClient = Depends(get_phoenix_client),
) -> TicketResponse:
    try:
        updated = await erp.set_ticket_status(ticket_id, body.status)
    except PhoenixAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail)) from exc

    return TicketResponse.model_validate(updated, from_attributes=True)
