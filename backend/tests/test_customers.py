"""Tests for GET /api/customers/{customer_id}."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.erp.exceptions import PhoenixAPIError, PhoenixNotFoundError, PhoenixUnauthorizedError
from app.erp.models import Customer, SystemInfo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_system(**overrides) -> SystemInfo:
    """Build a SystemInfo with sensible defaults."""
    defaults = dict(
        ip="10.0.0.5",
        port=22,
        username="azureuser",
        os="Ubuntu 22.04 LTS",
        notes=None,
    )
    defaults.update(overrides)
    return SystemInfo(**defaults)


def _make_customer(**overrides) -> Customer:
    """Build a Customer domain object with sensible defaults."""
    defaults = dict(
        id=5001,
        company_name="Nordlicht Logistik GmbH",
        firstname="Hans",
        lastname="Müller",
        system=_make_system(),
    )
    defaults.update(overrides)
    return Customer(**defaults)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_customer_returns_customer(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A successful GET returns the full customer object."""
    mock_erp_client.get_customer.return_value = _make_customer(id=5001)

    resp = await client.get("/api/customers/5001")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == 5001
    assert body["company_name"] == "Nordlicht Logistik GmbH"


@pytest.mark.anyio
async def test_get_customer_response_shape(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The response contains all expected top-level fields."""
    mock_erp_client.get_customer.return_value = _make_customer()

    resp = await client.get("/api/customers/5001")

    body = resp.json()
    expected_keys = {"id", "company_name", "firstname", "lastname", "system"}
    assert set(body.keys()) == expected_keys


@pytest.mark.anyio
async def test_get_customer_system_shape(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The nested system object contains all expected fields."""
    mock_erp_client.get_customer.return_value = _make_customer()

    resp = await client.get("/api/customers/5001")

    system = resp.json()["system"]
    expected_keys = {"ip", "port", "username", "os", "notes"}
    assert set(system.keys()) == expected_keys


@pytest.mark.anyio
async def test_get_customer_system_values(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """System fields are serialised with correct values."""
    mock_erp_client.get_customer.return_value = _make_customer(
        system=_make_system(ip="192.168.1.10", port=2222, username="admin", os="Debian 12")
    )

    resp = await client.get("/api/customers/5001")

    system = resp.json()["system"]
    assert system["ip"] == "192.168.1.10"
    assert system["port"] == 2222
    assert system["username"] == "admin"
    assert system["os"] == "Debian 12"


@pytest.mark.anyio
async def test_get_customer_system_notes_nullable(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The system 'notes' field is returned as null when not set."""
    mock_erp_client.get_customer.return_value = _make_customer(
        system=_make_system(notes=None)
    )

    resp = await client.get("/api/customers/5001")

    assert resp.json()["system"]["notes"] is None


@pytest.mark.anyio
async def test_get_customer_system_notes_present(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The system 'notes' field is returned when set."""
    mock_erp_client.get_customer.return_value = _make_customer(
        system=_make_system(notes="Firewall port 22 open")
    )

    resp = await client.get("/api/customers/5001")

    assert resp.json()["system"]["notes"] == "Firewall port 22 open"


@pytest.mark.anyio
async def test_get_customer_forwards_customer_id(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """The correct customer_id is forwarded to the ERP client."""
    mock_erp_client.get_customer.return_value = _make_customer(id=9999)

    await client.get("/api/customers/9999")

    mock_erp_client.get_customer.assert_awaited_once_with(9999)


# ---------------------------------------------------------------------------
# Error propagation tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_customer_not_found(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A 404 from the ERP is forwarded as 404."""
    mock_erp_client.get_customer.side_effect = PhoenixNotFoundError(404, "Customer not found")

    resp = await client.get("/api/customers/9999")

    assert resp.status_code == 404
    assert "Customer not found" in resp.json()["detail"]


@pytest.mark.anyio
async def test_get_customer_unauthorized(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A 401 from the ERP is forwarded as 401."""
    mock_erp_client.get_customer.side_effect = PhoenixUnauthorizedError(401, "Invalid token")

    resp = await client.get("/api/customers/5001")

    assert resp.status_code == 401
    assert "Invalid token" in resp.json()["detail"]


@pytest.mark.anyio
async def test_get_customer_erp_server_error(
    client: AsyncClient,
    mock_erp_client: AsyncMock,
) -> None:
    """A generic ERP error is forwarded with its original status code."""
    mock_erp_client.get_customer.side_effect = PhoenixAPIError(503, "Service Unavailable")

    resp = await client.get("/api/customers/5001")

    assert resp.status_code == 503
    assert "Service Unavailable" in resp.json()["detail"]
