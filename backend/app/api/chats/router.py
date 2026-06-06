"""Chat API routes."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from ...agent.approval_gate import approval_gate
from ...agent.event_bus import agent_event_bus
from ...agent.orchestrator import start_agent
from ...db.models import Chat, ToolCall
from ...db.session import get_db
from .schemas import ApprovalRequest, ChatResponse, StartChatRequest, ToolCallResponse, ChatListResponse

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get(
    "",
    response_model=ChatListResponse,
    summary="List chats",
    description="Retrieve all chats stored in the database, optionally filtered by ticket ID. Returns newest first.",
)
async def list_chats(
    ticket_id: str | None = Query(None, description="Filter chats by ticket ID"),
    db: AsyncSession = Depends(get_db),
) -> ChatListResponse:
    stmt = select(Chat).order_by(Chat.created_at.desc())
    if ticket_id is not None:
        stmt = stmt.where(Chat.ticket_id == ticket_id)
    result = await db.execute(stmt)
    chats = result.scalars().all()
    return ChatListResponse(
        chats=[ChatResponse.model_validate(c, from_attributes=True) for c in chats],
        count=len(chats),
    )


@router.post("", response_model=ChatResponse, status_code=201, summary="Start chat")
async def start_chat(
    body: StartChatRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    chat = Chat(ticket_id=body.ticket_id)
    db.add(chat)
    await db.commit()
    background_tasks.add_task(start_agent, chat.id, chat.ticket_id)
    return ChatResponse.model_validate(chat, from_attributes=True)


@router.get("/{chat_id}/stream", summary="SSE stream of agent events")
async def stream_chat(chat_id: uuid.UUID) -> EventSourceResponse:
    """
    Server-Sent Events stream for a running chat session.

    Event types emitted:
      text_delta          – agent text token (data: {content})
      tool_call_requested – waiting for technician approval (data: {tool_call_id, tool_name, args})
      tool_result         – SSH command result (data: {tool_call_id, stdout, stderr, exit_code})
      agent_completed     – run finished successfully (data: {summary})
      agent_failed        – run failed (data: {error})
      ping                – keepalive (no data)
    """

    async def _generate():
        q = agent_event_bus.subscribe(chat_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25)
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
                    continue

                if event is None:
                    break

                event_type = event.pop("event", "message")
                yield {"event": event_type, "data": json.dumps(event)}
        finally:
            agent_event_bus._queues.pop(chat_id, None)
            agent_event_bus._buffers.pop(chat_id, None)

    return EventSourceResponse(_generate(), ping=3600)


@router.get(
    "/{chat_id}/tool-calls",
    response_model=list[ToolCallResponse],
    summary="List tool calls for a chat",
)
async def list_tool_calls(
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ToolCallResponse]:
    result = await db.execute(
        select(ToolCall)
        .where(ToolCall.chat_id == chat_id)
        .order_by(ToolCall.created_at)
    )
    tool_calls = result.scalars().all()
    return [ToolCallResponse.model_validate(tc) for tc in tool_calls]


@router.patch(
    "/{chat_id}/tool-calls/{tool_call_id}",
    response_model=ToolCallResponse,
    summary="Approve or reject a pending tool call",
)
async def resolve_tool_call(
    chat_id: uuid.UUID,
    tool_call_id: uuid.UUID,
    body: ApprovalRequest,
    db: AsyncSession = Depends(get_db),
) -> ToolCallResponse:
    tool_call = await db.get(ToolCall, tool_call_id)
    if tool_call is None or tool_call.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Tool call not found")
    if tool_call.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Tool call is not pending (current status: {tool_call.status})",
        )

    new_status = "approved" if body.approved else "rejected"
    tool_call.status = new_status
    tool_call.resolved_at = datetime.now(timezone.utc)
    await db.commit()

    approval_gate.resolve(tool_call_id, body.approved)

    await agent_event_bus.publish(
        chat_id,
        {
            "event": "tool_call_approved" if body.approved else "tool_call_rejected",
            "tool_call_id": str(tool_call_id),
        },
    )

    return ToolCallResponse.model_validate(tool_call)
