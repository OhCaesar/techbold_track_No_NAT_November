"""Chat API routes."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ...agent.agent import start_agent
from ...db.models import Chat
from ...db.session import get_db
from .schemas import ChatResponse, StartChatRequest

router = APIRouter(prefix="/chats", tags=["chats"])


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
