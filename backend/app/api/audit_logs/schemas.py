"""Response DTOs for the audit logs API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    """Public representation of a single audit log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chat_id: uuid.UUID
    ticket_id: str
    command: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    was_blocked: bool
    executed_at: datetime


class AuditLogListResponse(BaseModel):
    """Wrapper for a list of audit log entries."""

    audit_logs: list[AuditLogResponse]
    count: int
