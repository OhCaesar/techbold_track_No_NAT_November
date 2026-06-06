from __future__ import annotations

import asyncio
import uuid


class ApprovalGate:
    """In-memory gate that blocks a tool until the technician approves or rejects it."""

    def __init__(self) -> None:
        self._events: dict[uuid.UUID, asyncio.Event] = {}
        self._decisions: dict[uuid.UUID, bool] = {}

    async def request_approval(self, tool_call_id: uuid.UUID) -> bool:
        """Called by a tool. Suspends until resolve() is called. Returns True = approved."""
        event = asyncio.Event()
        self._events[tool_call_id] = event
        await event.wait()
        return self._decisions.pop(tool_call_id, False)

    def resolve(self, tool_call_id: uuid.UUID, approved: bool) -> None:
        """Called by the approve/reject HTTP endpoint to unblock the waiting tool."""
        self._decisions[tool_call_id] = approved
        if e := self._events.pop(tool_call_id, None):
            e.set()

    def cancel(self, tool_call_id: uuid.UUID) -> None:
        """Reject and unblock without an explicit decision (used on shutdown/abort)."""
        self.resolve(tool_call_id, approved=False)


approval_gate = ApprovalGate()
