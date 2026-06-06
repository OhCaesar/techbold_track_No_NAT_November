from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from pydantic_ai import Agent, RunContext

from ..ssh.runner import FabricSSHRunner, SSHCommandBlockedError, SSHConnectionError, SSHResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dependency context injected per agent run
# ---------------------------------------------------------------------------


@dataclass
class TicketContext:
    """Runtime context passed to every tool call for a specific ticket."""

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
2. Diagnose with read-only commands: journalctl -xe, systemctl status, ss -tlnp, df -h, \
   dmesg | tail, top -bn1.
3. Propose fixes in small, targeted steps. Prefer restarting or reconfiguring a single \
   service over broad filesystem changes.
4. After applying a fix, validate it: re-run the diagnostic command that showed the \
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


async def start_agent(chat_id: uuid.UUID, ticket_id: str) -> None:
    """Entry point for the autopilot agent. Not yet implemented."""
    logger.info("start_agent called chat_id=%s ticket_id=%s", chat_id, ticket_id)


@autopilot_agent.tool
def run_ssh_command(ctx: RunContext[TicketContext], command: str) -> dict:
    """
    Execute a shell command on the customer VM for this ticket.

    Args:
        command: The shell command to run. Must be safe and targeted.

    Returns:
        A dict with keys: stdout, stderr, exit_code, duration_ms, succeeded.
        Blocked commands return succeeded=False and blocked=True.
    """
    deps = ctx.deps
    logger.info(
        "Agent requesting SSH command ticket=%d host=%s cmd=%r",
        deps.ticket_id, deps.host, command,
    )

    try:
        result: SSHResult = deps.runner.run(command)
    except SSHCommandBlockedError as exc:
        return {
            "stdout": "",
            "stderr": f"BLOCKED: {exc}",
            "exit_code": -1,
            "duration_ms": 0,
            "succeeded": False,
            "blocked": True,
        }
    except SSHConnectionError as exc:
        return {
            "stdout": "",
            "stderr": f"CONNECTION_ERROR: {exc}",
            "exit_code": -2,
            "duration_ms": 0,
            "succeeded": False,
        }

    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "succeeded": result.succeeded,
    }
