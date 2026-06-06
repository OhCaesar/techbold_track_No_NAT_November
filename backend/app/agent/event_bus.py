from __future__ import annotations

import asyncio
import uuid


class AgentEventBus:
    """Fans SSE events from a background agent task to one subscriber per chat."""

    def __init__(self) -> None:
        self._queues: dict[uuid.UUID, asyncio.Queue[dict | None]] = {}

    def subscribe(self, chat_id: uuid.UUID) -> asyncio.Queue[dict | None]:
        """Register an SSE listener. Overwrites any previous subscriber for this chat."""
        q: asyncio.Queue[dict | None] = asyncio.Queue()
        self._queues[chat_id] = q
        return q

    async def publish(self, chat_id: uuid.UUID, event: dict) -> None:
        """Publish an event to the subscriber. Silently drops if nobody is listening."""
        if q := self._queues.get(chat_id):
            await q.put(event)

    async def close(self, chat_id: uuid.UUID) -> None:
        """Send the sentinel None so the SSE generator knows to stop, then unregister."""
        if q := self._queues.get(chat_id):
            await q.put(None)
        self._queues.pop(chat_id, None)

    def is_subscribed(self, chat_id: uuid.UUID) -> bool:
        return chat_id in self._queues


agent_event_bus = AgentEventBus()
