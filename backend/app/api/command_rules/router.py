"""Command rules API routes — manage whitelist / blacklist patterns."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...agent.command_rules_cache import invalidate_cache
from ...db.models import CommandRule
from ...db.session import get_db
from .schemas import CommandRuleCreate, CommandRuleListResponse, CommandRuleResponse

router = APIRouter(prefix="/command-rules", tags=["command-rules"])


@router.get(
    "",
    response_model=CommandRuleListResponse,
    summary="List command rules",
    description=(
        "Retrieve all command rules (whitelist and blacklist). "
        "Optionally filter by rule_type ('whitelist' or 'blacklist')."
    ),
)
async def list_command_rules(
    rule_type: str | None = Query(
        None,
        description="Filter by rule type: 'whitelist' or 'blacklist'",
    ),
    db: AsyncSession = Depends(get_db),
) -> CommandRuleListResponse:
    stmt = select(CommandRule).order_by(CommandRule.created_at.asc())
    if rule_type is not None:
        stmt = stmt.where(CommandRule.rule_type == rule_type)
    result = await db.execute(stmt)
    rules = result.scalars().all()
    return CommandRuleListResponse(
        rules=[CommandRuleResponse.model_validate(r, from_attributes=True) for r in rules],
        count=len(rules),
    )


@router.post(
    "",
    response_model=CommandRuleResponse,
    status_code=201,
    summary="Add a command rule",
    description=(
        "Create a new whitelist or blacklist rule. The pattern must be a valid Python regex. "
        "Whitelist rules auto-approve matching commands; blacklist rules block them entirely."
    ),
)
async def create_command_rule(
    body: CommandRuleCreate,
    db: AsyncSession = Depends(get_db),
) -> CommandRuleResponse:
    # Validate the regex pattern
    try:
        re.compile(body.pattern)
    except re.error as exc:
        raise HTTPException(status_code=422, detail=f"Invalid regex pattern: {exc}")

    # Check for duplicates
    existing = await db.execute(
        select(CommandRule).where(
            CommandRule.pattern == body.pattern,
            CommandRule.rule_type == body.rule_type,
        )
    )
    if existing.scalars().first() is not None:
        raise HTTPException(
            status_code=409,
            detail=f"A {body.rule_type} rule with pattern {body.pattern!r} already exists.",
        )

    rule = CommandRule(
        pattern=body.pattern,
        rule_type=body.rule_type,
        description=body.description,
        is_default=False,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    # Invalidate the in-memory cache so changes take effect immediately
    invalidate_cache()

    return CommandRuleResponse.model_validate(rule, from_attributes=True)


@router.delete(
    "/{rule_id}",
    status_code=204,
    summary="Delete a command rule",
    description="Remove a command rule by ID. Works for both default and user-added rules.",
)
async def delete_command_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    rule = await db.get(CommandRule, rule_id)
    if rule is not None:
        await db.delete(rule)
        await db.commit()
        # Invalidate the in-memory cache so changes take effect immediately
        invalidate_cache()
