# Infrastructure Setup — Session Memory

## What was built

Project: **techbold AI Service Desk Autopilot** (START Hack track)
Branch: `feat/backend`
Date: 2026-06-06

---

## Files created

### `backend/app/config.py`
Centralised `pydantic-settings` config class (`Settings`). All modules call `get_settings()` — never `os.environ` directly. Covers Phoenix ERP, SSH, database, and LLM settings. Cached with `@lru_cache`.

### `backend/app/db/session.py`
Async SQLAlchemy setup:
- `engine` via `create_async_engine` (asyncpg driver)
- `AsyncSessionLocal` session factory (`expire_on_commit=False` to avoid `MissingGreenlet` errors)
- `Base` declarative base — models import this, never the reverse
- `get_db()` — FastAPI dependency that yields a session and handles commit/rollback
- `init_db()` — called on startup via lifespan to run `Base.metadata.create_all`

### `backend/app/ssh/__init__.py`
Empty package marker.

### `backend/app/ssh/runner.py`
Two classes:

**`CommandSafetyGuard`** — regex blocklist enforced before any network I/O. Blocks:
- `rm -rf` on `/`, `/etc`, `/var`, `/home`, `/boot`, `/usr`, `/srv`, `/root`
- `chmod -R 777 /`
- `chown -R` on sensitive dirs
- `DROP DATABASE`, `dropdb`, `pg_dropcluster`
- Deleting `/var/lib/postgresql` or `/var/lib/mysql`
- `systemctl stop/disable/mask` for `ufw`, `firewalld`, `fail2ban`, `auditd`, `apparmor`
- `ufw disable`
- Deleting or truncating `/var/log` or `/var/audit`

**`FabricSSHRunner`** — wraps `fabric.Connection`:
- `run(command, raise_on_failure=False)` → `SSHResult`
- `hide=True`, `warn=True`, `pty=False` (stdout/stderr stay separate)
- Fresh `Connection` per call (stateless — no stale connection between agent turns)
- Structured `SSH_AUDIT` log line for every executed command (no key material)
- stdout capped at 8 KB, stderr at 2 KB
- Raises `SSHCommandBlockedError`, `SSHConnectionError`, or `SSHCommandError`

### `backend/app/agent/__init__.py`
Empty package marker.

### `backend/app/agent/agent.py`
pydantic-ai agent:
- `TicketContext` dataclass — injected as `deps` per run: `ticket_id`, `host`, `port`, `description`, `runner`
- `autopilot_agent = Agent(model="openai:gpt-4o", deps_type=TicketContext, system_prompt=...)`
- Tool `get_ticket_context` — returns ticket metadata dict; should be called first
- Tool `run_ssh_command` — calls `runner.run(command)`, returns dict with `stdout/stderr/exit_code/duration_ms/succeeded`; returns `blocked=True` if safety guard fires
- Both tools are sync `def` — pydantic-ai runs them in a thread pool (Fabric/Paramiko is blocking)

**Invocation pattern for future routes:**
```python
runner = FabricSSHRunner(host=host, port=port, ticket_id=ticket_id)
deps = TicketContext(ticket_id=ticket_id, host=host, port=port, description=description, runner=runner)
result = await autopilot_agent.run(f"Ticket #{ticket_id}: {description}", deps=deps)
```

---

## Files modified

### `backend/requirements.txt`
Added: `httpx==0.27.0`, `fabric==3.2.2`, `pydantic-ai==0.0.14`, `asyncpg==0.30.0`, `sqlalchemy[asyncio]==2.0.36`, `openai==1.55.3`

### `docker-compose.yml`
Added `postgres:16` service with:
- `POSTGRES_PASSWORD` required (`:?` syntax — Docker Compose refuses to start if missing)
- `pg_isready` healthcheck (5s interval, 10 retries)
- Named volume `postgres_data` for data persistence
- Backend `depends_on: postgres: condition: service_healthy`

### `.env.example`
Added: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`

### `backend/app/main.py`
Added `lifespan` context manager that calls `init_db()` on startup before the app begins serving requests.

---

## Safety layer design

Three levels:
1. **`CommandSafetyGuard` (hard gate)** — regex blocklist, fires before any Fabric call
2. **System prompt constraints** — LLM told what categories of commands are forbidden
3. **Human-in-the-loop (future)** — `POST /api/runs/{id}/approve` route means agent proposes, technician approves, backend executes

---

## Startup / verification

```bash
# Copy env and set password
cp .env.example .env

# Build and start everything
docker compose up --build

# Verify health (proves init_db() succeeded)
curl http://localhost:8000/health
# -> {"status": "ok"}

# Test safety guard
docker compose exec backend python -c "
from app.ssh.runner import CommandSafetyGuard
g = CommandSafetyGuard()
g.check('rm -rf /')
"
# -> raises SSHCommandBlockedError
```
