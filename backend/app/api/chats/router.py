"""Chat API routes."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...agent.agent import start_agent
from ...db.models import Chat
from ...db.session import get_db
from .schemas import ChatListResponse, ChatResponse, StartChatRequest

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
