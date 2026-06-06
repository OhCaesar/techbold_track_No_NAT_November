from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StartChatRequest(BaseModel):
    ticket_id: str


class ChatMessageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sequence: int
    role: str
    content: str
    created_at: datetime


class ToolCallSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pydantic_call_id: str
    tool_name: str
    args_json: str
    status: str
    audit_log_id: Optional[uuid.UUID]
    created_at: datetime
    resolved_at: Optional[datetime]


class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_id: str
    status: str
    created_at: datetime


class ToolCallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chat_id: uuid.UUID
    pydantic_call_id: str
    tool_name: str
    args_json: str
    status: str
    audit_log_id: Optional[uuid.UUID] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None


class ApprovalRequest(BaseModel):
    approved: bool

class ChatListResponse(BaseModel):
    chats: list[ChatResponse]
    count: int
