from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from fabric import Connection
from paramiko.ssh_exception import SSHException

from ..config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety guard — blocked command patterns
# ---------------------------------------------------------------------------

_DANGEROUS_PATTERNS: list[str] = [
    # Recursive permission changes on root or critical paths
    r"chmod\s+.*-[rR].*\s+777\s+/",
    r"chmod\s+-[rR]\s+0?777\s+/",
    r"chown\s+-[rR]\s+\S+\s+/(?:etc|home|var|srv|root|boot|usr)\b",
    # Recursive deletion of system paths
    r"rm\s+.*--no-preserve-root",
    r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+/\s*$",
    r"rm\s+-[a-zA-Z]*f[a-zA-Z]*r\s+/\s*$",
    r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+/(?:etc|home|var|srv|root|boot|usr)\b",
    r"rm\s+-[a-zA-Z]*f[a-zA-Z]*r\s+/(?:etc|home|var|srv|root|boot|usr)\b",
    # Database destruction
    r"\bdrop\s+database\b",
    r"\bdropdb\b",
    r"\bpg_dropcluster\b",
    r"rm\s+.*(?:/var/lib/postgresql|/var/lib/mysql)\b",
    # Disabling security controls
    r"systemctl\s+(?:stop|disable|mask)\s+(?:ufw|firewalld|fail2ban|auditd|apparmor)\b",
    r"\bufw\s+disable\b",
    # Log destruction
    r"rm\s+.*(?:/var/log|/var/audit)\b",
    r">\s*/var/log/",
    r"\btruncate\b.*(?:/var/log|/var/audit)\b",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _DANGEROUS_PATTERNS]


class SSHCommandBlockedError(ValueError):
    """Raised when a command is blocked by the safety guard."""


class SSHConnectionError(RuntimeError):
    """Raised when Fabric cannot connect to the remote host."""


class SSHCommandError(RuntimeError):
    """Raised when a command exits non-zero and raise_on_failure=True."""


@dataclass
class CommandSafetyGuard:
    """Validates commands against the blocklist before execution."""

    extra_patterns: list[re.Pattern] = field(default_factory=list)

    def check(self, command: str) -> None:
        """Raise SSHCommandBlockedError if the command matches any dangerous pattern."""
        normalized = command.strip()
        for pattern in _COMPILED_PATTERNS + self.extra_patterns:
            if pattern.search(normalized):
                raise SSHCommandBlockedError(
                    f"Command blocked by safety guard (pattern: {pattern.pattern!r}): "
                    f"{normalized[:120]}"
                )


# ---------------------------------------------------------------------------
# SSH result
# ---------------------------------------------------------------------------


@dataclass
class SSHResult:
    command: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    host: str

    @property
    def succeeded(self) -> bool:
        return self.exit_code == 0


# ---------------------------------------------------------------------------
# Fabric SSH runner
# ---------------------------------------------------------------------------


@dataclass
class FabricSSHRunner:
    """Executes shell commands on a remote Ubuntu VM via Fabric/Paramiko."""

    host: str
    port: int = 22
    username: str = "azureuser"
    key_path: str = "/keys/id_rsa"
    ticket_id: int | None = None
    safety_guard: CommandSafetyGuard = field(default_factory=CommandSafetyGuard)
    _settings: Any = field(default_factory=get_settings, repr=False)

    def _make_connection(self) -> Connection:
        return Connection(
            host=self.host,
            port=self.port,
            user=self.username,
            connect_kwargs={"key_filename": self.key_path},
            connect_timeout=self._settings.ssh_connect_timeout,
        )

    def run(self, command: str, *, raise_on_failure: bool = False) -> SSHResult:
        """
        Execute a shell command on the remote host.

        Blocks dangerous commands, logs every execution, and returns SSHResult.
        Intentionally synchronous — pydantic-ai runs sync tools in a thread pool.
        """
        # Safety check first — raises SSHCommandBlockedError before any network I/O
        try:
            self.safety_guard.check(command)
        except SSHCommandBlockedError:
            logger.warning(
                "BLOCKED ssh command on host=%s ticket=%s cmd=%r",
                self.host, self.ticket_id, command[:200],
            )
            raise

        start = time.monotonic()
        try:
            with self._make_connection() as conn:
                result = conn.run(
                    command,
                    hide=True,     # suppress Fabric's own stdout echo
                    warn=True,     # don't raise on non-zero exit — we handle it
                    timeout=self._settings.ssh_command_timeout,
                    pty=False,     # keep stdout/stderr as separate streams
                )
        except (SSHException, OSError) as exc:
            raise SSHConnectionError(
                f"Cannot connect to {self.host}:{self.port} — {exc}"
            ) from exc

        duration_ms = int((time.monotonic() - start) * 1000)

        ssh_result = SSHResult(
            command=command,
            stdout=result.stdout[:8192],
            stderr=result.stderr[:2048],
            exit_code=result.return_code,
            duration_ms=duration_ms,
            host=self.host,
        )

        logger.info(
            "SSH_AUDIT host=%s port=%d user=%s ticket=%s exit=%d duration_ms=%d cmd=%r",
            self.host,
            self.port,
            self.username,
            self.ticket_id,
            ssh_result.exit_code,
            duration_ms,
            command[:200],
        )

        if raise_on_failure and not ssh_result.succeeded:
            raise SSHCommandError(
                f"Command failed (exit {ssh_result.exit_code}) on {self.host}: {command[:80]}"
            )

        return ssh_result
