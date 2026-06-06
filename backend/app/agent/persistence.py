from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import AuditLog, ChatMessage, ToolCall
from ..ssh.runner import SSHResult


async def save_message(
    db: AsyncSession,
    chat_id: uuid.UUID,
    role: str,
    content: str,
) -> ChatMessage:
    result = await db.execute(
        select(func.count()).where(ChatMessage.chat_id == chat_id)
    )
    sequence = result.scalar() or 0

    msg = ChatMessage(chat_id=chat_id, sequence=sequence, role=role, content=content)
    db.add(msg)
    await db.flush()
    return msg


async def save_tool_call(
    db: AsyncSession,
    chat_id: uuid.UUID,
    tool_name: str,
    args: dict,
    pydantic_call_id: str = "",
) -> ToolCall:
    tool_call = ToolCall(
        chat_id=chat_id,
        pydantic_call_id=pydantic_call_id,
        tool_name=tool_name,
        args_json=json.dumps(args),
        status="pending",
    )
    db.add(tool_call)
    await db.flush()
    return tool_call


async def update_tool_call_status(
    db: AsyncSession,
    tool_call_id: uuid.UUID,
    status: str,
    result_message_id: uuid.UUID | None = None,
    audit_log_id: uuid.UUID | None = None,
) -> None:
    tool_call = await db.get(ToolCall, tool_call_id)
    if tool_call is None:
        return
    tool_call.status = status
    tool_call.resolved_at = datetime.now(timezone.utc)
    if result_message_id is not None:
        tool_call.result_message_id = result_message_id
    if audit_log_id is not None:
        tool_call.audit_log_id = audit_log_id
    await db.flush()


async def save_audit_log(
    db: AsyncSession,
    chat_id: uuid.UUID,
    ticket_id: str,
    result: SSHResult,
    was_blocked: bool = False,
) -> AuditLog:
    log = AuditLog(
        chat_id=chat_id,
        ticket_id=ticket_id,
        command=result.command,
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        was_blocked=was_blocked,
    )
    db.add(log)
    await db.flush()
    return log
