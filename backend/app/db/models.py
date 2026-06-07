import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="running")
    # status values: "running" | "waiting_on_approval" | "idle" | "stopped"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="chat")
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="chat", order_by="ChatMessage.sequence"
    )
    tool_calls: Mapped[list["ToolCall"]] = relationship(back_populates="chat")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chats.id"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    command: Mapped[str] = mapped_column(Text, nullable=False)
    stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    stderr: Mapped[str] = mapped_column(Text, nullable=False, default="")
    exit_code: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    was_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_executed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    chat: Mapped["Chat"] = relationship(back_populates="audit_logs")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chats.id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    # role values: "system" | "user" | "assistant" | "tool"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # plain text for user/assistant; JSON string for tool results
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    chat: Mapped["Chat"] = relationship(back_populates="messages")
    tool_call: Mapped[Optional["ToolCall"]] = relationship(
        back_populates="result_message", foreign_keys="ToolCall.result_message_id"
    )


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chats.id"), nullable=False, index=True)
    pydantic_call_id: Mapped[str] = mapped_column(String, nullable=False)
    tool_name: Mapped[str] = mapped_column(String, nullable=False)
    args_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # status values: "pending" | "approved" | "rejected" | "executed" | "blocked"
    result_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("chat_messages.id"), nullable=True
    )
    audit_log_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("audit_logs.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    chat: Mapped["Chat"] = relationship(back_populates="tool_calls")
    result_message: Mapped[Optional["ChatMessage"]] = relationship(
        back_populates="tool_call", foreign_keys=[result_message_id]
    )
    audit_log: Mapped[Optional["AuditLog"]] = relationship()


class CommandRule(Base):
    """Persisted whitelist / blacklist rule for SSH command patterns."""

    __tablename__ = "command_rules"
    __table_args__ = (
        # Prevent duplicate patterns within the same rule type
        {"sqlite_autoincrement": True},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pattern: Mapped[str] = mapped_column(String, nullable=False)
    rule_type: Mapped[str] = mapped_column(String, nullable=False)
    # rule_type values: "whitelist" | "blacklist"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
