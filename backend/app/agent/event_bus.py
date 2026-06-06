from __future__ import annotations

import asyncio
import uuid


class AgentEventBus:
    """Fans SSE events from a background agent task to all active subscribers per chat.

    Events are buffered so late-connecting SSE clients receive the full history.
    Multiple simultaneous subscribers are supported via fan-out.
    """

    def __init__(self) -> None:
        self._queues: dict[uuid.UUID, list[asyncio.Queue[dict | None]]] = {}
        self._buffers: dict[uuid.UUID, list[dict | None]] = {}

    def subscribe(self, chat_id: uuid.UUID) -> asyncio.Queue[dict | None]:
        """Register an SSE listener, replaying all buffered events first."""
        q: asyncio.Queue[dict | None] = asyncio.Queue()
        for event in self._buffers.get(chat_id, []):
            q.put_nowait(event)
        self._queues.setdefault(chat_id, []).append(q)
        return q

    def unsubscribe(self, chat_id: uuid.UUID, q: asyncio.Queue[dict | None]) -> None:
        """Remove a specific subscriber queue without affecting others."""
        queues = self._queues.get(chat_id)
        if queues is not None:
            try:
                queues.remove(q)
            except ValueError:
                pass
            if not queues:
                self._queues.pop(chat_id, None)

    async def publish(self, chat_id: uuid.UUID, event: dict) -> None:
        """Buffer and publish an event to all active subscribers."""
        self._buffers.setdefault(chat_id, []).append(event)
        for q in self._queues.get(chat_id, []):
            await q.put(event)

    async def close(self, chat_id: uuid.UUID) -> None:
        """Buffer the sentinel None and signal all active subscribers to stop."""
        self._buffers.setdefault(chat_id, []).append(None)
        for q in self._queues.get(chat_id, []):
            await q.put(None)
        self._queues.pop(chat_id, None)

    def is_subscribed(self, chat_id: uuid.UUID) -> bool:
        return bool(self._queues.get(chat_id))


agent_event_bus = AgentEventBus()
