# ERP Client — Session Memory

## What was built

Module: `backend/app/erp/` — typed async HTTP client for the Phoenix ERP mock API.

---

## Files

| File | Purpose |
|---|---|
| `exceptions.py` | `PhoenixAPIError` base + `PhoenixUnauthorizedError` (401), `PhoenixNotFoundError` (404), `PhoenixValidationError` (422) |
| `models.py` | Pydantic v2 models mirroring OpenAPI schemas: `TicketStatus` (StrEnum), `Employee`, `SystemInfo`, `Ticket`, `CustomerSystem`, `Customer`, `StatusUpdate`, `ActivityCreate`, `Activity`, `SimpleMessage` |
| `client.py` | `PhoenixClient(base_url, token)` — 8 async methods + `get_phoenix_client()` FastAPI dependency |
| `__init__.py` | Re-exports everything; callers use `from app.erp import PhoenixClient, Ticket, ...` |

## Client methods

```
get_me()                                   → Employee
list_tickets(status, priority, sort)       → list[Ticket]
get_ticket(ticket_id)                      → Ticket
get_customer_system(ticket_id)             → CustomerSystem
set_ticket_status(ticket_id, status)       → Ticket
get_customer(customer_id)                  → Customer
create_activity(ActivityCreate)            → Activity
reset_me()                                 → SimpleMessage
```

## Config

Reads `phoenix_api_base_url` and `phoenix_api_token` from `Settings` (`app/config.py`) via `get_settings()`. Never hardcoded.

## Dependency injection

```python
from fastapi import Depends
from app.erp import PhoenixClient, get_phoenix_client

@router.get("/tickets")
async def list_tickets(erp: PhoenixClient = Depends(get_phoenix_client)):
    return await erp.list_tickets()
```

## Bug fixed during setup

`httpx==0.27.0` → `httpx==0.27.2` in `requirements.txt`.
`pydantic-ai-slim 0.0.14` requires `httpx>=0.27.2`; the old pin caused a Docker build conflict with `openai==1.55.3`.

## REPL testing

```bash
docker compose exec backend python3
```
Then import `PhoenixClient` and `get_settings`, construct client manually, call methods with `asyncio.run(...)`.
