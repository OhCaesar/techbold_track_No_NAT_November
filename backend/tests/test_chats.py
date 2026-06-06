"""Tests for GET /api/chats."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chat_row(**overrides):
    """Build a plain object that quacks like a Chat ORM row."""
    obj = MagicMock()
    obj.id = overrides.get("id", uuid.uuid4())
    obj.ticket_id = overrides.get("ticket_id", "7001")
    obj.status = overrides.get("status", "running")
    obj.created_at = overrides.get("created_at", datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc))
    return obj


def _setup_db_result(mock_db: AsyncMock, rows: list) -> None:
    """Wire mock_db.execute() to return `rows` via .scalars().all()."""
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = rows
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars_mock
    mock_db.execute = AsyncMock(return_value=execute_result)


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_chats_returns_all_chats(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """All chats stored in the DB are returned."""
    rows = [_make_chat_row(ticket_id="7001"), _make_chat_row(ticket_id="7002")]
    _setup_db_result(mock_db, rows)

    resp = await client_with_db.get("/api/chats")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert len(body["chats"]) == 2


@pytest.mark.anyio
async def test_list_chats_empty(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """An empty DB returns an empty list with count 0."""
    _setup_db_result(mock_db, [])

    resp = await client_with_db.get("/api/chats")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["chats"] == []


@pytest.mark.anyio
async def test_list_chats_response_shape(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Each chat in the response contains all expected fields."""
    _setup_db_result(mock_db, [_make_chat_row()])

    resp = await client_with_db.get("/api/chats")

    chat = resp.json()["chats"][0]
    expected_keys = {"id", "ticket_id", "status", "created_at"}
    assert set(chat.keys()) == expected_keys


@pytest.mark.anyio
async def test_list_chats_field_values(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Chat fields are serialised with correct values."""
    chat_id = uuid.uuid4()
    _setup_db_result(mock_db, [_make_chat_row(id=chat_id, ticket_id="9001", status="completed")])

    resp = await client_with_db.get("/api/chats")

    chat = resp.json()["chats"][0]
    assert chat["id"] == str(chat_id)
    assert chat["ticket_id"] == "9001"
    assert chat["status"] == "completed"


# ---------------------------------------------------------------------------
# ticket_id filter
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_chats_with_ticket_id_filter(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Passing ticket_id forwards a WHERE clause and the DB is queried once."""
    _setup_db_result(mock_db, [_make_chat_row(ticket_id="7001")])

    resp = await client_with_db.get("/api/chats", params={"ticket_id": "7001"})

    assert resp.status_code == 200
    # DB was queried (with the filter applied inside SQLAlchemy; we verify the call happened)
    mock_db.execute.assert_awaited_once()


@pytest.mark.anyio
async def test_list_chats_without_filter_queries_db_once(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Without a filter the DB is still queried exactly once."""
    _setup_db_result(mock_db, [])

    await client_with_db.get("/api/chats")

    mock_db.execute.assert_awaited_once()


@pytest.mark.anyio
async def test_list_chats_filter_returns_matching_chats(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """When a ticket_id filter is applied, only matching rows are returned."""
    _setup_db_result(mock_db, [_make_chat_row(ticket_id="7001")])

    resp = await client_with_db.get("/api/chats", params={"ticket_id": "7001"})

    body = resp.json()
    assert body["count"] == 1
    assert body["chats"][0]["ticket_id"] == "7001"
