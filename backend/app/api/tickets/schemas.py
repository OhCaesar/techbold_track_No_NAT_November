"""Response DTOs for the tickets API.

These schemas decouple the public REST contract from the internal
ERP domain models so that the response shape can evolve independently
(e.g. enriched with our own data) without breaking clients.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ...erp.models import TicketStatus


class TicketResponse(BaseModel):
    """Public representation of a single ticket."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    priority: str
    status: TicketStatus
    customer_id: int
    customer_name: str
    tags: list[str]
    sla_due_at: datetime | None = None
    created_at: datetime | None = None

    # Future: add our own enrichment fields here, e.g.:
    # agent_run_status: str | None = None
    # last_activity_at: datetime | None = None


class TicketListResponse(BaseModel):
    """Wrapper for a list of tickets."""

    tickets: list[TicketResponse]
    count: int
