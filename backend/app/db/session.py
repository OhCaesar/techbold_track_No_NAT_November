from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from ..config import get_settings


def _make_engine():
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
        echo=False,
    )


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables. Called on startup from lifespan."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS auto_executed BOOLEAN DEFAULT FALSE")
        )
        await conn.execute(
            text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS accepted BOOLEAN DEFAULT TRUE")
        )

    # Seed default command rules (whitelist + blacklist)
    await _seed_default_command_rules()


async def _seed_default_command_rules() -> None:
    """Insert hardcoded default patterns if the command_rules table is empty."""
    from ..db.models import CommandRule

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(CommandRule).limit(1))
        if result.scalars().first() is not None:
            return  # Already seeded

        # --- Whitelist: read-only diagnostic commands (auto-approved) ---
        _WHITELIST_DEFAULTS = [
            (r"^journalctl\b", "View journal/systemd logs"),
            (r"^systemctl\s+status\b", "Check service status"),
            (r"^systemctl\s+is-enabled\b", "Check if service is enabled"),
            (r"^systemctl\s+is-active\b", "Check if service is active"),
            (r"^systemctl\s+list-unit", "List systemd units"),
            (r"^df\b", "Show disk usage"),
            (r"^ss\b", "Show socket statistics"),
            (r"^top\b", "Show running processes"),
            (r"^dmesg\b", "Show kernel messages"),
            (r"^ps\b", "Show process list"),
            (r"^free\b", "Show memory usage"),
            (r"^uptime\b", "Show system uptime"),
            (r"^uname\b", "Show system info"),
            (r"^hostname\b", "Show hostname"),
            (r"^cat\b", "Print file contents"),
            (r"^ls\b", "List directory contents"),
            (r"^tail\b", "Show end of file"),
            (r"^head\b", "Show beginning of file"),
            (r"^grep\b", "Search text patterns"),
            (r"^netstat\b", "Show network statistics"),
            (r"^stat\b", "Show file status"),
            (r"^find\b", "Search for files"),
            (r"^curl\b", "Transfer data from URL"),
            (r"^namei\b", "Trace path ownership"),
            (r"^getent\b", "Query name-service databases"),
            (r"^nslookup\b", "DNS lookup"),
            (r"^dig\b", "DNS lookup"),
            (r"^ping\b", "Test network connectivity"),
            (r"^whoami\b", "Show current user"),
            (r"^id\b", "Show user/group IDs"),
            (r"^sort\b", "Sort text"),
            (r"^wc\b", "Count lines/words/bytes"),
            (r"^echo\b", "Print text"),
        ]

        # --- Blacklist: dangerous commands (always blocked) ---
        _BLACKLIST_DEFAULTS = [
            (r"chmod\s+.*-[rR].*\s+777\s+/", "Recursive chmod 777 on root"),
            (r"chmod\s+-[rR]\s+0?777\s+/", "Recursive chmod 777 on root"),
            (r"chown\s+-[rR]\s+\S+\s+/(?:etc|home|var|srv|root|boot|usr)\b", "Recursive chown on system paths"),
            (r"rm\s+.*--no-preserve-root", "rm with --no-preserve-root"),
            (r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+/\s*$", "rm -rf /"),
            (r"rm\s+-[a-zA-Z]*f[a-zA-Z]*r\s+/\s*$", "rm -fr /"),
            (r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+/(?:etc|home|var|srv|root|boot|usr)\b", "rm -rf on system paths"),
            (r"rm\s+-[a-zA-Z]*f[a-zA-Z]*r\s+/(?:etc|home|var|srv|root|boot|usr)\b", "rm -fr on system paths"),
            (r"\bdrop\s+database\b", "DROP DATABASE"),
            (r"\bdropdb\b", "dropdb command"),
            (r"\bpg_dropcluster\b", "PostgreSQL cluster destruction"),
            (r"rm\s+.*(?:/var/lib/postgresql|/var/lib/mysql)\b", "Delete database data files"),
            (r"systemctl\s+(?:stop|disable|mask)\s+(?:ufw|firewalld|fail2ban|auditd|apparmor)\b", "Disable security services"),
            (r"\bufw\s+disable\b", "Disable firewall"),
            (r"rm\s+.*(?:/var/log|/var/audit)\b", "Delete log files"),
            (r">\s*/var/log/", "Truncate log files via redirect"),
            (r"\btruncate\b.*(?:/var/log|/var/audit)\b", "Truncate log files"),
        ]

        for pattern, desc in _WHITELIST_DEFAULTS:
            db.add(CommandRule(pattern=pattern, rule_type="whitelist", description=desc, is_default=True))
        for pattern, desc in _BLACKLIST_DEFAULTS:
            db.add(CommandRule(pattern=pattern, rule_type="blacklist", description=desc, is_default=True))

        await db.commit()

