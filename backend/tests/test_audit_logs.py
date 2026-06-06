"""Tests for GET /api/audit-logs."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_log_row(**overrides):
    """Build a plain object that quacks like an AuditLog ORM row."""
    obj = MagicMock()
    obj.id = overrides.get("id", uuid.uuid4())
    obj.chat_id = overrides.get("chat_id", uuid.uuid4())
    obj.ticket_id = overrides.get("ticket_id", "7001")
    obj.command = overrides.get("command", "systemctl status nginx")
    obj.stdout = overrides.get("stdout", "● nginx.service - active")
    obj.stderr = overrides.get("stderr", "")
    obj.exit_code = overrides.get("exit_code", 0)
    obj.duration_ms = overrides.get("duration_ms", 42)
    obj.was_blocked = overrides.get("was_blocked", False)
    obj.executed_at = overrides.get(
        "executed_at", datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc)
    )
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
async def test_list_audit_logs_returns_all_entries(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """All audit log entries stored in the DB are returned."""
    rows = [_make_log_row(command="uptime"), _make_log_row(command="df -h")]
    _setup_db_result(mock_db, rows)

    resp = await client_with_db.get("/api/audit-logs")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert len(body["audit_logs"]) == 2


@pytest.mark.anyio
async def test_list_audit_logs_empty(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """An empty DB returns an empty list with count 0."""
    _setup_db_result(mock_db, [])

    resp = await client_with_db.get("/api/audit-logs")

    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 0
    assert body["audit_logs"] == []


@pytest.mark.anyio
async def test_list_audit_logs_response_shape(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Each audit log entry contains all expected fields."""
    _setup_db_result(mock_db, [_make_log_row()])

    resp = await client_with_db.get("/api/audit-logs")

    entry = resp.json()["audit_logs"][0]
    expected_keys = {
        "id", "chat_id", "ticket_id", "command",
        "stdout", "stderr", "exit_code", "duration_ms",
        "was_blocked", "executed_at",
    }
    assert set(entry.keys()) == expected_keys


@pytest.mark.anyio
async def test_list_audit_logs_field_values(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Audit log fields are serialised with correct values."""
    log_id = uuid.uuid4()
    chat_id = uuid.uuid4()
    _setup_db_result(mock_db, [
        _make_log_row(
            id=log_id,
            chat_id=chat_id,
            ticket_id="9001",
            command="reboot",
            stdout="",
            stderr="permission denied",
            exit_code=1,
            duration_ms=99,
            was_blocked=True,
        )
    ])

    resp = await client_with_db.get("/api/audit-logs")

    entry = resp.json()["audit_logs"][0]
    assert entry["id"] == str(log_id)
    assert entry["chat_id"] == str(chat_id)
    assert entry["ticket_id"] == "9001"
    assert entry["command"] == "reboot"
    assert entry["stderr"] == "permission denied"
    assert entry["exit_code"] == 1
    assert entry["duration_ms"] == 99
    assert entry["was_blocked"] is True


# ---------------------------------------------------------------------------
# Filter tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_audit_logs_filter_by_chat_id(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Passing chat_id triggers a DB query (WHERE clause applied inside SQLAlchemy)."""
    chat_id = uuid.uuid4()
    _setup_db_result(mock_db, [_make_log_row(chat_id=chat_id)])

    resp = await client_with_db.get("/api/audit-logs", params={"chat_id": str(chat_id)})

    assert resp.status_code == 200
    mock_db.execute.assert_awaited_once()


@pytest.mark.anyio
async def test_list_audit_logs_filter_by_ticket_id(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Passing ticket_id triggers a DB query (WHERE clause applied inside SQLAlchemy)."""
    _setup_db_result(mock_db, [_make_log_row(ticket_id="7001")])

    resp = await client_with_db.get("/api/audit-logs", params={"ticket_id": "7001"})

    assert resp.status_code == 200
    mock_db.execute.assert_awaited_once()


@pytest.mark.anyio
async def test_list_audit_logs_both_filters(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """Both chat_id and ticket_id filters can be combined."""
    chat_id = uuid.uuid4()
    _setup_db_result(mock_db, [_make_log_row(chat_id=chat_id, ticket_id="7001")])

    resp = await client_with_db.get(
        "/api/audit-logs",
        params={"chat_id": str(chat_id), "ticket_id": "7001"},
    )

    assert resp.status_code == 200
    mock_db.execute.assert_awaited_once()


@pytest.mark.anyio
async def test_list_audit_logs_invalid_chat_id_returns_422(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """A non-UUID chat_id is rejected by FastAPI validation before hitting the DB."""
    resp = await client_with_db.get("/api/audit-logs", params={"chat_id": "not-a-uuid"})

    assert resp.status_code == 422
    mock_db.execute.assert_not_awaited()


@pytest.mark.anyio
async def test_list_audit_logs_db_queried_once(
    client_with_db: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """The DB is queried exactly once per request."""
    _setup_db_result(mock_db, [])

    await client_with_db.get("/api/audit-logs")

    mock_db.execute.assert_awaited_once()
