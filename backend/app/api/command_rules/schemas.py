"""Response and request DTOs for the command rules API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CommandRuleCreate(BaseModel):
    """Payload for creating a new command rule."""

    pattern: str = Field(..., description="Regex pattern to match against commands")
    rule_type: Literal["whitelist", "blacklist"] = Field(
        ..., description="'whitelist' for auto-approved commands, 'blacklist' for always-blocked commands"
    )
    description: Optional[str] = Field(None, description="Human-readable description of the rule")


class CommandRuleResponse(BaseModel):
    """Public representation of a command rule."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pattern: str
    rule_type: str
    description: Optional[str]
    is_default: bool
    created_at: datetime


class CommandRuleListResponse(BaseModel):
    """Wrapper for a list of command rules."""

    rules: list[CommandRuleResponse]
    count: int
