from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from ..config import get_settings
from ..ssh.resolver import resolve_ssh_key
from ..ssh.runner import FabricSSHRunner, SSHCommandBlockedError, SSHConnectionError, SSHResult

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

You have two tools:
- get_ticket_context — returns the ticket description and the SSH target (host, port).
- run_ssh_command — opens an SSH connection to that host and runs a single shell command. \
  This is the ONLY way to interact with the customer VM. Every diagnostic check and every \
  fix must go through run_ssh_command. Do not describe what you would run — call the tool.

Workflow:
1. Call get_ticket_context to learn the ticket description and SSH target.
2. Call run_ssh_command with read-only diagnostics to understand the current state. \
   Start with: journalctl -xe, systemctl status <relevant-service>, ss -tlnp, df -h, \
   dmesg | tail -20, top -bn1. Each call is a separate SSH invocation — that is fine.
3. Based on the output, propose and apply a targeted fix by calling run_ssh_command.
4. Validate the fix: call run_ssh_command again with the diagnostic command that originally \
   showed the problem and confirm the output changed.

IMPORTANT: You must actually invoke the tools — do not just narrate what you would do. \
The technician is waiting for real diagnostic output.

Hard limits — never call run_ssh_command with:
- rm -rf on any system path (/, /etc, /var, /boot, /home, /usr)
- chmod -R 777 on any path
- Disabling firewalls (ufw disable, systemctl stop ufw/fail2ban)
- Dropping databases (DROP DATABASE, dropdb)
- Deleting or truncating log files (/var/log/*)
- Any command that could cause irreversible data loss

If uncertain, call a safer diagnostic step rather than a destructive fix.

After completing the diagnosis and fix, provide a detailed summary covering:
- What the root cause was (the technical cause, not just the symptom)
- What actions were taken in order
- Which commands were key
- How you validated the fix
"""

# ---------------------------------------------------------------------------
# Read-only command auto-approval (TEMPORARY — for demo/testing)
# ---------------------------------------------------------------------------

_READONLY_PATTERNS: list[str] = [
    r"^journalctl\b",
    r"^systemctl\s+status\b",
    r"^df\b",
    r"^ss\b",
    r"^top\b",
    r"^dmesg\b",
    r"^ps\b",
    r"^free\b",
    r"^uptime\b",
    r"^uname\b",
    r"^hostname\b",
    r"^cat\b",
    r"^ls\b",
    r"^tail\b",
    r"^head\b",
    r"^grep\b",
    r"^netstat\b",
    r"^stat\b",
]

_READONLY_COMPILED = [re.compile(p) for p in _READONLY_PATTERNS]


def _is_readonly_command(command: str) -> bool:
    """Return True if the command matches a known read-only diagnostic pattern."""
    normalized = command.strip()
    return any(p.match(normalized) for p in _READONLY_COMPILED)


def _build_agent() -> Agent[TicketContext, str]:
    settings = get_settings()
    provider = OpenAIProvider(
        base_url=settings.azure_openai_endpoint or None,
        api_key=settings.openai_api_key or None,
    )
    model = OpenAIModel(settings.openai_model, provider=provider)
    return Agent(model=model, deps_type=TicketContext, system_prompt=SYSTEM_PROMPT)


autopilot_agent: Agent[TicketContext, str] = _build_agent()


# ---------------------------------------------------------------------------
# Runner factory
# ---------------------------------------------------------------------------


def build_runner_for_customer(
    customer_id: int,
    host: str,
    port: int,
    username: str,
    ticket_id: int,
) -> FabricSSHRunner:
    """Create a FabricSSHRunner with the correct per-customer SSH key."""
    settings = get_settings()
    key_path = resolve_ssh_key(customer_id, keys_dir=settings.ssh_keys_dir)
    return FabricSSHRunner(
        host=host,
        port=port,
        username=username,
        key_path=key_path,
        ticket_id=ticket_id,
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
async def run_ssh_command(ctx: RunContext[TicketContext], command: str) -> str:
    """
    Open an SSH connection to the customer VM and execute a single shell command.

    This is the only way to interact with the remote system. Call this for every
    diagnostic check and every fix — it connects automatically to the host returned
    by get_ticket_context. Each call is an independent SSH session; no persistent
    shell state is preserved between calls.

    Requires technician approval before the command actually runs.

    Args:
        command: Shell command to execute on the remote host. Must be safe and targeted.

    Returns:
        Command output (stdout/stderr/exit_code) or a rejection/blocked/error message.
    """
    import asyncio
    import json

    from .approval_gate import approval_gate
    from .event_bus import agent_event_bus
    from .persistence import save_audit_log, save_message, save_tool_call, update_tool_call_status
    from ..db.session import AsyncSessionLocal

    deps = ctx.deps

    # 1. Safety check BEFORE any I/O
    try:
        deps.runner.safety_guard.check(command)
    except SSHCommandBlockedError as exc:
        return f"BLOCKED: {exc}"

    logger.info(
        "SSH command requested chat_id=%s ticket_id=%s cmd=%r",
        deps.chat_id, deps.ticket_id, command,
    )

    # 2. Persist pending tool call
    async with AsyncSessionLocal() as db:
        tool_call = await save_tool_call(
            db, deps.chat_id, "run_ssh_command", {"command": command},
            pydantic_call_id=ctx.tool_call_id,
        )
        await db.commit()

    # 3. Notify frontend — auto-approve read-only diagnostics, otherwise require technician
    auto_approved = _is_readonly_command(command)
    await agent_event_bus.publish(deps.chat_id, {
        "event": "tool_call_requested",
        "tool_call_id": str(tool_call.id),
        "tool_name": "run_ssh_command",
        "args": {"command": command},
        "auto_approved": auto_approved,
    })

    # 4. Block until the technician approves or rejects (skipped for read-only commands)
    if auto_approved:
        approved = True
    else:
        approved = await approval_gate.request_approval(tool_call.id)

    if not approved:
        async with AsyncSessionLocal() as db:
            await update_tool_call_status(db, tool_call.id, "rejected")
            await db.commit()
        return "Command rejected by technician."

    # 5. Execute via sync runner in a thread
    try:
        result: SSHResult = await asyncio.to_thread(deps.runner.run, command)
    except SSHConnectionError as exc:
        async with AsyncSessionLocal() as db:
            await update_tool_call_status(db, tool_call.id, "executed")
            await db.commit()
        return f"CONNECTION_ERROR: {exc}"

    # 6. Persist audit log and tool result message
    async with AsyncSessionLocal() as db:
        audit_log = await save_audit_log(
            db, deps.chat_id, str(deps.ticket_id), result,
        )
        result_msg = await save_message(
            db, deps.chat_id, "tool",
            json.dumps({
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
            }),
        )
        await update_tool_call_status(
            db, tool_call.id, "executed",
            result_message_id=result_msg.id,
            audit_log_id=audit_log.id,
        )
        await db.commit()

    # 7. Notify frontend of the result
    await agent_event_bus.publish(deps.chat_id, {
        "event": "tool_result",
        "tool_call_id": str(tool_call.id),
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "blocked": False,
    })

    return (
        f"exit_code: {result.exit_code}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
