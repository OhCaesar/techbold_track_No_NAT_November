"""Tests for GET /api/tickets."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.erp.exceptions import PhoenixAPIError, PhoenixNotFoundError, PhoenixUnauthorizedError
from app.erp.models import Ticket, TicketStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ticket(**overrides) -> Ticket:
    """Build a Ticket domain object with sensible defaults."""
    defaults = dict(
        id=1,
        title="VPN tunnel down",
        description="Customer reports VPN not connecting since this morning.",
        priority="HIGH",
        status=TicketStatus.OPEN,
        customer_id=42,
        customer_name="Acme Corp",
        tags=["vpn", "network"],
        sla_due_at=datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc),
        created_at=datetime(2026, 6, 6, 8, 0, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return Ticket(**defaults)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_tickets_returns_tickets(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """Tickets from the ERP are returned in the response body."""
    tickets = [_make_ticket(id=1), _make_ticket(id=2, title="Firewall issue")]
    mock_erp_client.list_tickets.return_value = tickets

    resp = await client.get("/api/tickets")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert len(body["tickets"]) == 2
    assert body["tickets"][0]["id"] == 1
    assert body["tickets"][1]["id"] == 2
    assert body["tickets"][0]["title"] == "VPN tunnel down"


@pytest.mark.anyio
async def test_list_tickets_empty(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """An empty ERP result returns an empty list with count 0."""
    mock_erp_client.list_tickets.return_value = []

    resp = await client.get("/api/tickets")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["tickets"] == []


@pytest.mark.anyio
async def test_list_tickets_response_shape(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """Each ticket in the response contains all expected fields."""
    mock_erp_client.list_tickets.return_value = [_make_ticket()]

    resp = await client.get("/api/tickets")

    ticket = resp.json()["tickets"][0]
    expected_keys = {
        "id", "title", "description", "priority", "status",
        "customer_id", "customer_name", "tags", "sla_due_at", "created_at",
    }
    assert set(ticket.keys()) == expected_keys


@pytest.mark.anyio
async def test_list_tickets_serialises_enums_and_dates(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """Status enums and datetime fields are serialised correctly."""
    mock_erp_client.list_tickets.return_value = [_make_ticket()]

    resp = await client.get("/api/tickets")

    ticket = resp.json()["tickets"][0]
    assert ticket["status"] == "OPEN"
    assert "2026-06-07" in ticket["sla_due_at"]
    assert "2026-06-06" in ticket["created_at"]


@pytest.mark.anyio
async def test_list_tickets_nullable_dates(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """Nullable datetime fields are returned as null when unset."""
    mock_erp_client.list_tickets.return_value = [
        _make_ticket(sla_due_at=None, created_at=None),
    ]

    resp = await client.get("/api/tickets")

    ticket = resp.json()["tickets"][0]
    assert ticket["sla_due_at"] is None
    assert ticket["created_at"] is None


# ---------------------------------------------------------------------------
# Query parameter forwarding
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_tickets_forwards_status_filter(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The status query param is forwarded to the ERP client."""
    mock_erp_client.list_tickets.return_value = []

    await client.get("/api/tickets", params={"status": "OPEN"})

    mock_erp_client.list_tickets.assert_awaited_once_with(
        status=TicketStatus.OPEN,
        priority=None,
        sort=None,
    )


@pytest.mark.anyio
async def test_list_tickets_forwards_priority_filter(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The priority query param is forwarded to the ERP client."""
    mock_erp_client.list_tickets.return_value = []

    await client.get("/api/tickets", params={"priority": "HIGH"})

    mock_erp_client.list_tickets.assert_awaited_once_with(
        status=None,
        priority="HIGH",
        sort=None,
    )


@pytest.mark.anyio
async def test_list_tickets_forwards_sort(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The sort query param is forwarded to the ERP client."""
    mock_erp_client.list_tickets.return_value = []

    await client.get("/api/tickets", params={"sort": "-created_at"})

    mock_erp_client.list_tickets.assert_awaited_once_with(
        status=None,
        priority=None,
        sort="-created_at",
    )


@pytest.mark.anyio
async def test_list_tickets_forwards_all_params(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """All query params can be combined."""
    mock_erp_client.list_tickets.return_value = []

    await client.get(
        "/api/tickets",
        params={"status": "PENDING", "priority": "LOW", "sort": "title"},
    )

    mock_erp_client.list_tickets.assert_awaited_once_with(
        status=TicketStatus.PENDING,
        priority="LOW",
        sort="title",
    )


@pytest.mark.anyio
async def test_list_tickets_invalid_status_returns_422(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """An invalid status value is rejected by FastAPI validation."""
    resp = await client.get("/api/tickets", params={"status": "INVALID"})

    assert resp.status_code == 422
    mock_erp_client.list_tickets.assert_not_awaited()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_tickets_erp_unauthorized(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A 401 from the ERP is forwarded as a 401 to the caller."""
    mock_erp_client.list_tickets.side_effect = PhoenixUnauthorizedError(
        401, "Invalid token",
    )

    resp = await client.get("/api/tickets")

    assert resp.status_code == 401
    assert "Invalid token" in resp.json()["detail"]


@pytest.mark.anyio
async def test_list_tickets_erp_not_found(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A 404 from the ERP is forwarded as a 404 to the caller."""
    mock_erp_client.list_tickets.side_effect = PhoenixNotFoundError(
        404, "Resource not found",
    )

    resp = await client.get("/api/tickets")

    assert resp.status_code == 404


@pytest.mark.anyio
async def test_list_tickets_erp_server_error(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A generic ERP error is forwarded with the original status code."""
    mock_erp_client.list_tickets.side_effect = PhoenixAPIError(
        502, "Bad Gateway",
    )

    resp = await client.get("/api/tickets")

    assert resp.status_code == 502
    assert "Bad Gateway" in resp.json()["detail"]
