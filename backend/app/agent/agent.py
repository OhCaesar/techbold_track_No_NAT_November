from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from pydantic_ai import Agent, RunContext

from ..ssh.runner import FabricSSHRunner

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dependency context injected per agent run
# ---------------------------------------------------------------------------


@dataclass
class TicketContext:
    """Runtime context passed to every tool call for a specific ticket."""

    chat_id: uuid.UUID
    ticket_id: int
    host: str
    port: int
    description: str
    runner: FabricSSHRunner


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an AI assistant helping a managed-service technician troubleshoot and fix \
Ubuntu Linux systems over SSH.

Workflow:
1. Call get_ticket_context first to understand what you are working on.
2. Call open_ssh_connection to connect to the customer VM.
3. Diagnose with read-only commands: journalctl -xe, systemctl status, ss -tlnp, df -h, \
   dmesg | tail, top -bn1.
4. Propose fixes in small, targeted steps. Prefer restarting or reconfiguring a single \
   service over broad filesystem changes.
5. After applying a fix, validate it: re-run the diagnostic command that showed the \
   problem and confirm the output changed.

Hard limits — never suggest or run:
- rm -rf on any system path (/, /etc, /var, /boot, /home, /usr)
- chmod -R 777 on any path
- Disabling firewalls (ufw disable, systemctl stop ufw/fail2ban)
- Dropping databases (DROP DATABASE, dropdb)
- Deleting or truncating log files (/var/log/*)
- Any command that could cause irreversible data loss

If uncertain, propose a safer diagnostic step rather than a destructive fix. \
Document every command you run and why.

After completing the diagnosis and fix, provide a detailed summary covering:
- What the root cause was (the technical cause, not just the symptom)
- What actions were taken in order
- Which commands were key
- How you validated the fix
"""

autopilot_agent: Agent[TicketContext, str] = Agent(
    model="openai:gpt-4o",
    deps_type=TicketContext,
    system_prompt=SYSTEM_PROMPT,
)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@autopilot_agent.tool
def get_ticket_context(ctx: RunContext[TicketContext]) -> dict:
    """Return the current ticket metadata and target system information. Call this first."""
    deps = ctx.deps
    return {
        "ticket_id": deps.ticket_id,
        "host": deps.host,
        "port": deps.port,
        "description": deps.description,
    }


@autopilot_agent.tool
async def open_ssh_connection(ctx: RunContext[TicketContext]) -> str:
    """
    Open an SSH connection to the customer VM. Call this before run_ssh_command.

    The technician must approve this connection request.

    --- IMPLEMENTATION CONTRACT (fill in by the SSH tool provider) ---
    1. from ..agent.persistence import save_tool_call, update_tool_call_status
       from ..agent.event_bus import agent_event_bus
       from ..agent.approval_gate import approval_gate
       from ..db.session import AsyncSessionLocal

    2. async with AsyncSessionLocal() as db:
           tool_call = await save_tool_call(
               db, ctx.deps.chat_id, "open_ssh_connection", {},
               pydantic_call_id=ctx.tool_call_id,
           )
           await db.commit()

    3. await agent_event_bus.publish(ctx.deps.chat_id, {
           "event": "tool_call_requested",
           "tool_call_id": str(tool_call.id),
           "tool_name": "open_ssh_connection",
           "args": {},
       })

    4. approved = await approval_gate.request_approval(tool_call.id)

    5. async with AsyncSessionLocal() as db:
           if not approved:
               await update_tool_call_status(db, tool_call.id, "rejected")
               await db.commit()
               return "Connection rejected by technician."

           # Verify connectivity
           try:
               result = await asyncio.to_thread(ctx.deps.runner.run, "echo connected")
           except Exception as exc:
               await update_tool_call_status(db, tool_call.id, "executed")
               await db.commit()
               return f"SSH connection failed: {exc}"

           await update_tool_call_status(db, tool_call.id, "executed")
           await db.commit()

    6. await agent_event_bus.publish(ctx.deps.chat_id, {
           "event": "tool_result",
           "tool_call_id": str(tool_call.id),
           "result": "connected",
       })

    7. return f"Connected to {ctx.deps.host}:{ctx.deps.port}"
    ---
    """
    raise NotImplementedError("open_ssh_connection must be implemented by the SSH tool provider")


@autopilot_agent.tool
async def run_ssh_command(ctx: RunContext[TicketContext], command: str) -> str:
    """
    Execute a shell command on the customer VM. Requires technician approval.

    Args:
        command: Shell command to run. Must be safe and targeted.

    Returns:
        Command output (stdout/stderr/exit_code) or a rejection/error message.

    --- IMPLEMENTATION CONTRACT (fill in by the SSH tool provider) ---
    1. from ..ssh.runner import CommandSafetyGuard, SSHCommandBlockedError
       from ..agent.persistence import save_tool_call, update_tool_call_status, save_audit_log
       from ..agent.event_bus import agent_event_bus
       from ..agent.approval_gate import approval_gate
       from ..db.session import AsyncSessionLocal

    2. # Safety check — MUST happen before any DB write or network I/O
       guard = CommandSafetyGuard()
       try:
           guard.check(command)
       except SSHCommandBlockedError as exc:
           # Optionally persist a blocked AuditLog here
           return f"BLOCKED: {exc}"

    3. async with AsyncSessionLocal() as db:
           tool_call = await save_tool_call(
               db, ctx.deps.chat_id, "run_ssh_command", {"command": command},
               pydantic_call_id=ctx.tool_call_id,
           )
           await db.commit()

    4. await agent_event_bus.publish(ctx.deps.chat_id, {
           "event": "tool_call_requested",
           "tool_call_id": str(tool_call.id),
           "tool_name": "run_ssh_command",
           "args": {"command": command},
       })

    5. approved = await approval_gate.request_approval(tool_call.id)

    6. async with AsyncSessionLocal() as db:
           if not approved:
               await update_tool_call_status(db, tool_call.id, "rejected")
               await db.commit()
               return "Command rejected by technician."

           result = await asyncio.to_thread(ctx.deps.runner.run, command)

           audit_log = await save_audit_log(
               db, ctx.deps.chat_id, str(ctx.deps.ticket_id), result
           )
           result_msg = await save_message(db, ctx.deps.chat_id, "tool",
               json.dumps({"stdout": result.stdout, "stderr": result.stderr,
                           "exit_code": result.exit_code}))
           await update_tool_call_status(
               db, tool_call.id, "executed",
               result_message_id=result_msg.id,
               audit_log_id=audit_log.id,
           )
           await db.commit()

    7. await agent_event_bus.publish(ctx.deps.chat_id, {
           "event": "tool_result",
           "tool_call_id": str(tool_call.id),
           "stdout": result.stdout,
           "stderr": result.stderr,
           "exit_code": result.exit_code,
           "blocked": False,
       })

    8. return (
           f"exit_code: {result.exit_code}\n"
           f"stdout:\n{result.stdout}\n"
           f"stderr:\n{result.stderr}"
       )
    ---
    """
    raise NotImplementedError("run_ssh_command must be implemented by the SSH tool provider")
