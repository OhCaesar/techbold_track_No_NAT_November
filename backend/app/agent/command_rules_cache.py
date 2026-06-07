"""Centralized in-memory cache for command whitelist / blacklist patterns.

Patterns are loaded from the ``command_rules`` DB table and compiled into
``re.Pattern`` objects.  The cache is loaded lazily on first access and can be
explicitly invalidated (e.g. after a rule is added/deleted via the API).
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from sqlalchemy import select

from ..db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal cache state
# ---------------------------------------------------------------------------

_whitelist_cache: Optional[list[re.Pattern]] = None
_blacklist_cache: Optional[list[re.Pattern]] = None


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def invalidate_cache() -> None:
    """Reset both caches so the next access re-fetches from the DB."""
    global _whitelist_cache, _blacklist_cache
    _whitelist_cache = None
    _blacklist_cache = None
    logger.info("Command-rule caches invalidated")


async def load_whitelist() -> list[re.Pattern]:
    """Return compiled whitelist patterns, loading from DB if needed."""
    global _whitelist_cache
    if _whitelist_cache is not None:
        return _whitelist_cache
    _whitelist_cache = await _load_patterns("whitelist")
    logger.info("Loaded %d whitelist patterns from DB", len(_whitelist_cache))
    return _whitelist_cache


async def load_blacklist() -> list[re.Pattern]:
    """Return compiled blacklist patterns, loading from DB if needed."""
    global _blacklist_cache
    if _blacklist_cache is not None:
        return _blacklist_cache
    _blacklist_cache = await _load_patterns("blacklist")
    logger.info("Loaded %d blacklist patterns from DB", len(_blacklist_cache))
    return _blacklist_cache


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _load_patterns(rule_type: str) -> list[re.Pattern]:
    from ..db.models import CommandRule

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CommandRule.pattern).where(CommandRule.rule_type == rule_type)
        )
        rows = result.scalars().all()

    compiled: list[re.Pattern] = []
    for raw in rows:
        try:
            compiled.append(re.compile(raw, re.IGNORECASE if rule_type == "blacklist" else 0))
        except re.error as exc:
            logger.warning("Skipping invalid regex %r: %s", raw, exc)
    return compiled
