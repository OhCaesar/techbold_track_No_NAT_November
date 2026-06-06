# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

An AI-assisted IT service-desk autopilot for the START Hack Vienna '26 techbold track. The backend agent connects to customer VMs over SSH, diagnoses incidents, proposes fixes for human approval, then writes a structured activity log back to the Phoenix ERP mock. **Every SSH command requires human approval before execution.**

## Commands

### Full stack (Docker)
```bash
docker compose up --build          # backend :8000, frontend :80
```

### Backend (local)
```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload
```

### Frontend (local)
```bash
cd frontend && npm install && npm run start   # dev server on :4200
npm run prettier                              # check formatting
npm run prettier-write                        # fix formatting
npm run test                                  # Vitest unit tests (watch)
npm run test:ci                               # Vitest unit tests (CI / no watch)
```

### Backend tests
```bash
cd backend
.venv/bin/pytest                              # all tests
.venv/bin/pytest tests/test_tickets.py        # single file
.venv/bin/pytest -k "test_list_tickets_empty" # single test
```

Tests run without Docker — no real DB or Phoenix ERP needed (both are mocked in `conftest.py`).

## Architecture

### Backend (`backend/app/`)

| Package | Purpose |
|---------|---------|
| `erp/` | `PhoenixClient` — all Phoenix ERP API calls (tickets, customer-system, activities). `get_phoenix_client` is a FastAPI dependency that yields a scoped client. |
| `ssh/` | `FabricSSHRunner` — executes commands on customer VMs; `CommandSafetyGuard` blocks dangerous patterns before any network I/O. Intentionally **synchronous** (pydantic-ai runs tools in a thread pool). |
| `agent/` | `pydantic-ai` `Agent[TicketContext, str]` with `run_ssh_command` and `get_ticket_context` tools. `start_agent()` is the entry point (currently a stub). |
| `api/tickets/` | `GET /api/tickets` — proxies to Phoenix with optional status/priority/sort filters. |
| `api/chats/` | `POST /api/chats` — creates a `Chat` row and enqueues `start_agent` as a background task. |
| `db/` | `Chat` and `AuditLog` SQLAlchemy ORM models. `init_db()` runs `CREATE TABLE IF NOT EXISTS` at startup. `get_db` is the session dependency. |
| `config.py` | `Settings` via `pydantic-settings` — reads from `.env`. Cached with `@lru_cache`. |

### Frontend (`frontend/src/app/`)

Angular 22 SPA. Current components:
- `pages/chat-list/` — ticket/chat list page
- `ticket-detailview/` — ticket detail view
- `chat-list-element/` — list item component

Routes are in `app.routes.ts`.

### Data flow
```
Frontend → POST /api/chats → Chat created → start_agent(chat_id, ticket_id) [background]
                                               ↓
                                   Agent fetches ticket context
                                   Agent proposes SSH command
                                   [Human approves via frontend]
                                   SSHRunner.run() → safety guard → Fabric/Paramiko
                                   AuditLog written to Postgres
                                   Agent validates, generates activity
                                   PhoenixClient.create_activity() + set_ticket_status(DONE)
```

### Key design constraints

- **ERP token and SSH key never leave the backend** — never pass them to the frontend.
- `CommandSafetyGuard` in `ssh/runner.py` must block before any network I/O — extend its `_DANGEROUS_PATTERNS` list rather than removing checks.
- The SSH runner is sync; wrap async callers with `asyncio.to_thread` or let pydantic-ai handle it.
- `DATABASE_URL` uses `postgresql+asyncpg://...@postgres:5432/...` inside Docker; swap `postgres` → `localhost` for local dev.

## Environment variables

Copy `.env.example` → `.env`. Critical vars:

| Variable | Notes |
|----------|-------|
| `PHOENIX_API_BASE_URL` / `PHOENIX_API_TOKEN` | From Builder Base |
| `SSH_PRIVATE_KEY_PATH` | Path inside container: `/keys/your-key.pem` |
| `DATABASE_URL` | Change host to `localhost` for local-only dev |
| `POSTGRES_PASSWORD` | Must be set; no default |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Bring-your-own LLM credentials |

## Testing conventions

- All async tests use `@pytest.mark.anyio`; `anyio_backend = "asyncio"` is fixed in `conftest.py`.
- Tests override the FastAPI lifespan with a no-op (no DB) and replace `get_phoenix_client` with `AsyncMock(spec=PhoenixClient)`.
- Use `_make_ticket(**overrides)` helper to build `Ticket` fixtures.
- ERP errors are tested by setting `mock_erp_client.<method>.side_effect` to a `PhoenixAPIError` subclass.

## Scoring hard fails (automatic zero for an incident)

Avoid suggesting or running: `DROP DATABASE`, `dropdb`, `chmod -R 777 /`, `rm -rf /` (or system paths), `ufw disable` / `systemctl stop ufw`, deleting/truncating `/var/log/*`, and running as superuser to bypass DB permissions. The `CommandSafetyGuard` already blocks many of these — keep it intact.
