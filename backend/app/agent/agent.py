from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field

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
    ssh_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an AI assistant helping a managed-service technician troubleshoot and fix \
Ubuntu Linux systems over SSH.

You have one tool:
- run_ssh_command — executes a single shell command on the customer VM over a persistent \
  SSH connection. This is the ONLY way to interact with the remote system. Every diagnostic \
  check and every fix must go through run_ssh_command. Do not describe what you would \
  run — call the tool.

IMPORTANT: Call only ONE tool at a time. Wait for the result before calling the next tool. \
Never issue multiple run_ssh_command calls in the same turn.

For every run_ssh_command call you MUST supply a `reason` argument: one short, precise \
sentence explaining why you are running that specific command. No preamble, no bloat.

== MANDATORY WORKFLOW ==

Step 1 — Discover what is deployed:
  find /opt/hackathon -maxdepth 4 -type f | sort
  ls -la /opt/hackathon/
Read the relevant service files, configs, and scripts in /opt/hackathon/ to understand \
what is running and where it stores data.

Step 2 — Diagnose. Choose commands based on the ticket type:

  Service not starting / crashes:
    systemctl status <service> --no-pager
    systemctl is-enabled <service>          ← ALWAYS check this if it died after a reboot
    journalctl -u <service> -n 50 --no-pager
    ss -tlnp

  Permission / file errors:
    ls -la <directory>
    stat <path>
    ps aux | grep <service>                  ← find what user the process runs as
    namei -l <path>                          ← trace ownership along full path

  Network / connectivity errors:
    curl -sv <url> 2>&1 | head -30
    cat /etc/hosts
    getent hosts <hostname>
    ss -tlnp

  Database errors (PostgreSQL):
    journalctl -u postgresql -n 50 --no-pager
    df -h                                    ← disk full is a common write-failure cause
    sudo -u postgres psql -c "\\l" 2>&1
    sudo -u postgres psql -c "SELECT pg_postmaster_start_time();" 2>&1

  Monitoring / metrics not updating:
    systemctl list-units --type=service --state=failed --no-pager
    systemctl list-units --type=service | grep -iE 'monitor|metric|collect|agent|exporter'
    journalctl -u <metrics-service> -n 30 --no-pager

Step 3 — Apply the targeted fix. Common patterns:
  - Service exists but not enabled: sudo systemctl enable <service> && sudo systemctl start <service>
  - Wrong directory ownership: sudo chown -R <user>:<group> <directory>
  - Hostname not resolvable: echo "<ip>  <hostname>" | sudo tee -a /etc/hosts
  - PostgreSQL sequence/privilege issue: sudo -u postgres psql -c "<fix statement>"

Step 4 — Run the validation script to finalize your work and see if it did the correct things:
  sudo /opt/hackathon/public-test.sh
The output must indicate success. Always run this script to validate and finalize your work. If it fails, diagnose further — do NOT stop until the test passes.

== HARD LIMITS ==
Never run:
- rm -rf on any system path (/, /etc, /var, /boot, /home, /usr)
- chmod -R 777 on any path
- ufw disable or systemctl stop ufw/fail2ban
- DROP DATABASE, dropdb, or anything that destroys data
- Deleting or truncating log files (/var/log/*)

If uncertain, run a safer diagnostic step first.

== FINAL SUMMARY ==
After the acceptance test passes, provide a summary covering:
- Root cause (technical cause, not just the symptom)
- Actions taken in order
- Key commands used
- Proof the fix worked (acceptance test output)
"""

# ---------------------------------------------------------------------------
# Read-only command auto-approval — loaded from DB (command_rules table)
# ---------------------------------------------------------------------------


async def _is_readonly_command(command: str) -> bool:
    """Return True if the command matches a known read-only (whitelisted) pattern."""
    from .command_rules_cache import load_whitelist

    patterns = await load_whitelist()
    normalized = command.strip()
    return any(p.match(normalized) for p in patterns)


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
async def run_ssh_command(ctx: RunContext[TicketContext], command: str, reason: str) -> str:
    """
    Execute a single shell command on the customer VM over the persistent SSH connection.

    This is the only way to interact with the remote system. Call this for every
    diagnostic check and every fix — it connects automatically to the host returned
    by get_ticket_context. The SSH connection is shared across all calls in a session;
    each call runs in its own exec channel so shell state (cwd, env vars) does not
    persist between calls. Commands run sequentially — the next call blocks until
    the current one completes.

    Requires technician approval before the command actually runs.

    Args:
        command: Shell command to execute on the remote host. Must be safe and targeted.
        reason: One short sentence explaining why this specific command is being run.

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

    # 1. Safety check BEFORE any I/O — check DB blacklist + built-in safety guard
    from .command_rules_cache import load_blacklist

    blacklist_patterns = await load_blacklist()
    normalized_cmd = command.strip()
    for pattern in blacklist_patterns:
        if pattern.search(normalized_cmd):
            return (
                f"BLOCKED: Command blocked by safety guard "
                f"(pattern: {pattern.pattern!r}): {normalized_cmd[:120]}"
            )

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
            db, deps.chat_id, "run_ssh_command", {"command": command, "reason": reason},
            pydantic_call_id=ctx.tool_call_id,
        )
        await db.commit()

    # 3. Notify frontend — auto-approve read-only diagnostics, otherwise require technician
    auto_approved = await _is_readonly_command(command)
    await agent_event_bus.publish(deps.chat_id, {
        "event": "tool_call_requested",
        "tool_call_id": str(tool_call.id),
        "tool_name": "run_ssh_command",
        "args": {"command": command, "reason": reason},
        "auto_approved": auto_approved,
    })

    # 4–7. Acquire the sequential lock — prevents concurrent SSH execution
    async with deps.ssh_lock:
        # 4. Block until the technician approves or rejects (skipped for read-only commands)
        if auto_approved:
            approved = True
        else:
            approved = await approval_gate.request_approval(tool_call.id, deps.chat_id)

        if not approved:
            async with AsyncSessionLocal() as db:
                await update_tool_call_status(db, tool_call.id, "rejected")
                await save_audit_log(
                    db,
                    chat_id=deps.chat_id,
                    ticket_id=str(deps.ticket_id),
                    command=command,
                    stdout="",
                    stderr="",
                    exit_code=0,
                    duration_ms=0,
                    was_blocked=True,
                    auto_executed=False,
                    accepted=False,
                )
                await save_message(
                    db, deps.chat_id, "tool",
                    json.dumps({
                        "tool_call_id": str(tool_call.id),
                        "command": command,
                        "reason": reason,
                        "stdout": "",
                        "stderr": "Command rejected by technician.",
                        "exit_code": -1,
                    }),
                )
                await db.commit()
            await agent_event_bus.publish(deps.chat_id, {
                "event": "tool_result",
                "tool_call_id": str(tool_call.id),
                "stdout": "",
                "stderr": "Command rejected by technician.",
                "exit_code": -1,
                "blocked": False,
            })
            return "Command rejected by technician."

        # 5. Execute via sync runner in a thread
        try:
            result: SSHResult = await asyncio.to_thread(deps.runner.run, command)
        except SSHConnectionError as exc:
            error_msg = f"SSH connection error: {exc}"
            async with AsyncSessionLocal() as db:
                await update_tool_call_status(db, tool_call.id, "executed")
                await save_message(
                    db, deps.chat_id, "tool",
                    json.dumps({
                        "tool_call_id": str(tool_call.id),
                        "command": command,
                        "reason": reason,
                        "stdout": "",
                        "stderr": error_msg,
                        "exit_code": -1,
                    }),
                )
                await db.commit()
            await agent_event_bus.publish(deps.chat_id, {
                "event": "tool_result",
                "tool_call_id": str(tool_call.id),
                "stdout": "",
                "stderr": error_msg,
                "exit_code": -1,
                "blocked": False,
            })
            return f"CONNECTION_ERROR: {exc}"

        # 6. Persist audit log and tool result message
        async with AsyncSessionLocal() as db:
            audit_log = await save_audit_log(
                db,
                chat_id=deps.chat_id,
                ticket_id=str(deps.ticket_id),
                command=command,
                stdout=result.stdout,
                stderr=result.stderr,
                exit_code=result.exit_code,
                duration_ms=result.duration_ms,
                was_blocked=False,
                auto_executed=auto_approved,
                accepted=True,
            )
            result_msg = await save_message(
                db, deps.chat_id, "tool",
                json.dumps({
                    "tool_call_id": str(tool_call.id),
                    "command": command,
                    "reason": reason,
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
