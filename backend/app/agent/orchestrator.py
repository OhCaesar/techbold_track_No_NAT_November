from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from ..config import get_settings
from ..db.models import AuditLog, Chat
from ..db.session import AsyncSessionLocal
from ..erp.client import PhoenixClient
from ..erp.models import ActivityCreate, TicketStatus
from .agent import TicketContext, autopilot_agent, build_runner_for_customer
from .approval_gate import approval_gate
from .event_bus import agent_event_bus
from .persistence import save_message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-chat task and message-queue registries
# ---------------------------------------------------------------------------

_agent_tasks: dict[uuid.UUID, asyncio.Task] = {}
_message_queues: dict[uuid.UUID, asyncio.Queue[str]] = {}


# ---------------------------------------------------------------------------
# Public API: abort and send-message
# ---------------------------------------------------------------------------


def abort_agent(chat_id: uuid.UUID) -> bool:
    """Cancel the running agent task. Returns True if a live task was found."""
    approval_gate.cancel_all_for_chat(chat_id)
    task = _agent_tasks.get(chat_id)
    if task is None or task.done():
        return False
    task.cancel()
    return True


async def send_message_to_agent(chat_id: uuid.UUID, content: str) -> bool:
    """Enqueue a user message for an idle agent. Returns True if queue exists."""
    queue = _message_queues.get(chat_id)
    if queue is None:
        return False
    await queue.put(content)
    return True


# ---------------------------------------------------------------------------
# Entry point (called by BackgroundTasks)
# ---------------------------------------------------------------------------


async def start_agent(
    chat_id: uuid.UUID,
    ticket_id: str,
    restart_message: str | None = None,
) -> None:
    """
    Thin dispatcher: creates the real asyncio.Task and registers it so it can
    be cancelled via abort_agent(). Awaits the task so Starlette keeps the
    background-task context alive.

    restart_message: if provided, used as the first user prompt instead of
    building one from ERP data (used when restarting a stopped/failed chat).
    """
    queue: asyncio.Queue[str] = asyncio.Queue()
    _message_queues[chat_id] = queue
    task = asyncio.create_task(_run_agent_loop(chat_id, ticket_id, queue, restart_message))
    _agent_tasks[chat_id] = task
    try:
        await task
    except asyncio.CancelledError:
        pass
    finally:
        _agent_tasks.pop(chat_id, None)
        _message_queues.pop(chat_id, None)


# ---------------------------------------------------------------------------
# Multi-turn agent loop
# ---------------------------------------------------------------------------


async def _run_agent_loop(
    chat_id: uuid.UUID,
    ticket_id: str,
    queue: asyncio.Queue[str],
    restart_message: str | None = None,
) -> None:
    """
    Orchestrates a full troubleshooting session for one ticket.

    Runs in a loop: each iteration streams one agent turn, submits the ERP
    activity, then waits for the next technician message. The loop exits on
    asyncio.CancelledError (stop button) or on an unhandled exception.
    """
    settings = get_settings()
    start_time = datetime.now(timezone.utc)

    logger.info("🚀 Starting agent for chat_id=%s, ticket_id=%s", chat_id, ticket_id)

    async with AsyncSessionLocal() as db:
        chat = await db.get(Chat, chat_id)
        if chat is None:
            logger.error("_run_agent_loop: chat %s not found", chat_id)
            return

        runner = None
        try:
            erp = PhoenixClient(settings.phoenix_api_base_url, settings.phoenix_api_token)
            try:
                ticket = await erp.get_ticket(int(ticket_id))
                customer_system = await erp.get_customer_system(int(ticket_id))
            finally:
                await erp.close()

            runner = build_runner_for_customer(
                customer_id=customer_system.customer_id,
                host=customer_system.system.ip,
                port=customer_system.system.port,
                username=customer_system.system.username,
                ticket_id=int(ticket_id),
            )
            await asyncio.to_thread(runner.open_connection)

            ctx = TicketContext(
                chat_id=chat_id,
                ticket_id=int(ticket_id),
                host=customer_system.system.ip,
                port=customer_system.system.port,
                description=ticket.description,
                runner=runner,
            )

            logger.debug(
                "TicketContext built chat_id=%s ticket_id=%s host=%s port=%s description=%r",
                ctx.chat_id, ctx.ticket_id, ctx.host, ctx.port, ctx.description,
            )

            if restart_message is None:
                initial_prompt = (
                    f"Ticket #{ticket.id}: {ticket.title}\n\n"
                    f"Customer: {ticket.customer_name}\n"
                    f"Priority: {ticket.priority}\n\n"
                    f"{ticket.description}\n\n"
                    "Please diagnose and resolve this incident now. "
                    "Follow the workflow: call get_ticket_context first, then run diagnostic "
                    "commands, apply a targeted fix, and validate the result."
                )
            else:
                initial_prompt = restart_message
            await save_message(db, chat_id, "user", initial_prompt)
            await db.commit()

            # ----------------------------------------------------------------
            # Multi-turn loop
            # ----------------------------------------------------------------

            message_history: list = []
            current_input = initial_prompt
            turn = 0

            while True:
                chat.status = "running"
                await db.commit()

                full_text = ""
                async with autopilot_agent.run_stream(
                    current_input,
                    deps=ctx,
                    message_history=message_history if message_history else None,
                    model_settings={"parallel_tool_calls": False},
                ) as result:
                    async for delta in result.stream_text(delta=True):
                        full_text += delta
                        await agent_event_bus.publish(chat_id, {
                            "event": "text_delta",
                            "content": delta,
                        })

                message_history = list(result.all_messages())

                await save_message(db, chat_id, "assistant", full_text)
                await db.commit()

                end_time = datetime.now(timezone.utc)

                activity = await _generate_activity(
                    db=db,
                    chat_id=chat_id,
                    ticket_id=int(ticket_id),
                    narrative=full_text,
                    start_time=start_time,
                    end_time=end_time,
                )

                erp = PhoenixClient(settings.phoenix_api_base_url, settings.phoenix_api_token)
                try:
                    await erp.create_activity(activity)
                    await erp.set_ticket_status(int(ticket_id), TicketStatus.DONE)
                finally:
                    await erp.close()

                chat.status = "idle"
                await db.commit()

                await agent_event_bus.publish(chat_id, {
                    "event": "agent_completed",
                    "summary": activity.summary or "",
                })
                await agent_event_bus.publish(chat_id, {"event": "agent_idle"})

                # Wait for next user message — CancelledError fires here on abort
                new_message = await queue.get()

                chat.status = "running"
                await db.commit()
                await save_message(db, chat_id, "user", new_message)
                await db.commit()

                current_input = new_message
                start_time = datetime.now(timezone.utc)
                turn += 1

        except asyncio.CancelledError:
            logger.info("Agent cancelled for chat_id=%s", chat_id)
            chat.status = "stopped"
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            await agent_event_bus.publish(chat_id, {"event": "agent_stopped"})
            raise

        except Exception as exc:
            logger.exception(
                "_run_agent_loop failed chat_id=%s ticket_id=%s: %s",
                chat_id, ticket_id, exc,
            )
            chat.status = "failed"
            try:
                await db.commit()
            except Exception:
                await db.rollback()

            await agent_event_bus.publish(chat_id, {
                "event": "agent_failed",
                "error": str(exc),
            })

        finally:
            if runner is not None:
                await asyncio.to_thread(runner.close_connection)
            await agent_event_bus.close(chat_id)


async def _generate_activity(
    db,
    chat_id: uuid.UUID,
    ticket_id: int,
    narrative: str,
    start_time: datetime,
    end_time: datetime,
) -> ActivityCreate:
    """Use a structured LLM call to extract ActivityCreate fields from the run narrative."""
    from openai import AsyncOpenAI

    settings = get_settings()

    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.chat_id == chat_id)
        .order_by(AuditLog.executed_at)
    )
    audit_logs = result.scalars().all()

    commands_lines = [
        f"$ {log.command}\n# exit={log.exit_code}\n{log.stdout[:400]}"
        for log in audit_logs
        if not log.was_blocked
    ]
    commands_text = "\n\n".join(commands_lines) if commands_lines else "(no commands executed)"

    extraction_prompt = (
        "You are extracting structured fields for a service-desk activity report.\n\n"
        "TROUBLESHOOTING NARRATIVE:\n"
        f"{narrative[:4000]}\n\n"
        "COMMANDS AND THEIR OUTPUT:\n"
        f"{commands_text[:2000]}\n\n"
        "Return a JSON object with exactly these keys:\n"
        "  summary          – one sentence: what was restored/fixed\n"
        "  root_cause       – the technical root cause (not the symptom)\n"
        "  actions_taken    – ordered prose: diagnosis steps then fix steps\n"
        "  commands_summary – key commands used, no output, no secrets\n"
        "  validation_result – concrete proof the customer benefit is restored\n"
    )

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": extraction_prompt}],
            response_format={"type": "json_object"},
            max_tokens=1024,
            timeout=30,
        )
        data: dict = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("Activity extraction LLM call failed: %s", exc)
        data = {}

    return ActivityCreate(
        ticket_id=ticket_id,
        start_datetime=start_time,
        end_datetime=end_time,
        summary=data.get("summary") or (narrative[:200] if narrative else "Incident resolved."),
        root_cause=data.get("root_cause") or "See narrative.",
        actions_taken=data.get("actions_taken") or narrative[:1000],
        commands_summary=data.get("commands_summary") or commands_text[:500],
        validation_result=data.get("validation_result") or "Validated by technician.",
    )
