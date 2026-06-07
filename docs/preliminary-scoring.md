# Preliminary Scoring Assessment
_Date: 2026-06-07 — based on static code analysis, no live VM testing_

---

## Quick Summary

| Category | Max | Estimated | Notes |
|----------|----:|----------:|-------|
| A · Functional MVP & ERP Workflow | 20 | 14–16 | Missing status column + no filter/sort UI |
| B · Troubleshooting Performance | 35 | TBD | Depends on live VM grading; infrastructure is solid |
| C · Safety, Auditability & Responsible AI | 20 | 16–18 | echo/curl/find auto-approved; stdout stored verbatim |
| D · Technician Experience & Human Control | 10 | 7–8 | No status in list; Lorem ipsum in notes; no explicit retry |
| E · Engineering Quality & Reproducibility | 15 | 10–12 | README is the original template, never updated |
| **Total (excl. B)** | **65** | **47–54** | |

---

## A — Functional MVP & ERP Workflow (20 pts) — ~14–16

### Load tickets via ERP API — 5 pts ✓
`PhoenixClient.list_tickets()` (`erp/client.py`) calls `GET /api/v1/me/tickets` with
optional `status`, `priority`, `sort` params. Proxied through `GET /api/tickets`
(`api/tickets/router.py`). Error handling maps 401/404/422 to HTTP exceptions.

### Ticket list: title, customer, priority, status — 3 pts → ~2
`ticket-list.component.html` renders company name, title, priority, due date, and
tags. **Status is not rendered anywhere in the list view.** The scoring criterion
explicitly requires status to be visible. Partial credit likely: ~2/3.

### Sort or filter by status, priority, or date — 2 pts → ~0–1
The backend API accepts `?status=`, `?priority=`, `?sort=` and forwards them to the
ERP. The frontend `TicketListComponent` calls `getTickets()` with no parameters
(`ticket-list.component.ts:40`) and provides no filter or sort controls in the
template. Users cannot change the view. Likely 0–1/2.

### Load customer system information — 4 pts ✓
`orchestrator.py` fetches `get_customer_system(ticket_id)` at agent start. The
`ticket-detailview.component.html` displays OS, IP, and port in the left panel.
The `GET /api/customers/{id}` endpoint also provides this independently.

### Create activity with complete schema — 4 pts ✓
`_generate_activity()` (`orchestrator.py:264`) builds `ActivityCreate` with all
graded fields: `summary`, `root_cause`, `actions_taken`, `commands_summary`,
`validation_result`. A structured LLM call extracts each field from the agent
narrative and the audit log command list. All fields have non-empty fallbacks.

### Auth, 404, empty states — 2 pts ✓
`PhoenixAPIError` hierarchy (`erp/exceptions.py`) covers 401, 404, 422, and generic
errors. All three API routers convert these to appropriate `HTTPException` responses.
Frontend signals (`isLoading`, `error`) handle empty and error states gracefully.

---

## B — Troubleshooting Performance (35 pts) — TBD (live grading)

Infrastructure assessment only; actual score depends on hidden incidents.

**Strengths:**
- System prompt (`agent.py:42–129`) enforces a strict 5-step workflow:
  1. Read `/opt/hackathon/public-test.sh` first (acceptance test)
  2. Discover deployment structure under `/opt/hackathon/`
  3. Diagnose with category-specific commands (service, permission, network, DB, metrics)
  4. Apply targeted minimal fix
  5. Re-run acceptance test; loop until it passes
- `systemctl is-enabled` is explicitly prompted for persistence checks
- `validation_result` in the activity captures concrete proof (acceptance test output)
- Multi-turn loop allows the technician to guide the agent if it gets stuck

**Risk — duplicate activities on multi-turn sessions:**
`_run_agent_loop` posts an activity and sets ticket to DONE after **every turn**
(`orchestrator.py:195–218`). If the technician sends a follow-up message, a second
activity is created for the same ticket. Graders may flag this or it may simply
produce redundant ERP records.

**Risk — activity generated regardless of success:**
The activity is generated and posted even if the acceptance test failed or if the
agent stopped mid-diagnosis. A failed resolution still writes a DONE status.

---

## C — Safety, Auditability & Responsible AI (20 pts) — ~16–18

### Complete audit trail — 4 pts ✓
`AuditLog` table (`db/models.py`) captures every SSH command: `command`, `stdout`,
`stderr`, `exit_code`, `duration_ms`, `was_blocked`, `auto_executed`, `accepted`,
`executed_at`. Persisted in `save_audit_log()` (`agent/persistence.py`) both for
blocked and executed commands. Exposed via `GET /api/audit-logs`.

### No dangerous blanket commands — 4 pts ✓
`CommandSafetyGuard` (`ssh/runner.py`) blocks 17 regex patterns covering:
- `chmod -R 777 /…` and variants
- `chown -R` on `/etc`, `/home`, `/var`, `/srv`, `/root`, `/boot`, `/usr`
- `rm -rf /`, `rm -rf /etc` and other critical paths; `--no-preserve-root`
- `DROP DATABASE`, `dropdb`, `pg_dropcluster`, `rm /var/lib/postgresql`
- `systemctl stop/disable/mask ufw/firewalld/fail2ban/auditd/apparmor`
- `ufw disable`
- `rm /var/log/…`, `> /var/log/…`, `truncate /var/log/…`

Guard runs **before** any network I/O at both the runner layer and in `run_ssh_command`.

### Secret protection — 4 pts → ~3
The ERP token and SSH key never reach the frontend (verified: no leakage through
API schemas or SSE events). `.env` and `keys/` are git-ignored. The `commands_summary`
extraction prompt explicitly says "no secrets".

**Gap:** `stdout` is stored verbatim in the `AuditLog` table (up to 8192 chars,
`ssh/runner.py:184`). If a command prints a secret (e.g. `cat .env`, `env`), it is
persisted in the database and returned by `GET /api/audit-logs`. The current design
trusts the agent not to run such commands, but there is no scrubbing layer.

### Minimal changes — 4 pts ✓
System prompt instructs targeted fixes only (e.g. `chown` on a specific upload
directory, not recursively on `/var`). The hard-limits section (`agent.py:113–121`)
reinforces no broad filesystem changes.

### Human control & stop conditions — 4 pts ✓
- All non-read-only commands block on `approval_gate.request_approval()` until the
  technician clicks ACCEPT or DECLINE in the frontend
- STOP button calls `POST /api/chats/{id}/abort` → `abort_agent()` → cancels
  the asyncio task and rejects all pending approvals
- Message input allows the technician to guide the agent between turns

**Gap — auto-approved patterns include fix-class commands:**
`echo` (`agent.py:168`) is in the read-only auto-approval list. However, the system
prompt explicitly recommends `echo "<ip>  <hostname>" | sudo tee -a /etc/hosts` as
a fix step. A command matching `^echo\b` that pipes into `tee` with root escalation
would be auto-approved without technician review. Same concern applies to `curl`
(could POST data to external hosts) and `find` (could use `-exec` or `-delete`).

---

## D — Technician Experience & Human Control (10 pts) — ~7–8

### Ticket overview — 2 pts → ~1
List shows: company name, title, priority (colour-coded), due date, tags. **Status is
absent from both the `ListItem` interface and the template.** No filter or sort
controls are present. A technician cannot see which tickets are open vs. done at a
glance. ~1/2.

### Ticket detail with customer system info — 2 pts → ~1.5
Left panel shows ticket title, customer name, OS, IP, and port. The description is
rendered as markdown. **The "Notes" section (`ticket-detailview.component.html:77–83`)
contains Lorem ipsum placeholder text**, not real customer notes from the ERP.

### Visible agent progress — 2 pts ✓
SSE stream delivers `text_delta` events rendered in real time. `streamStatus` signal
shows connection state. Tool call cards display status badges (pending / auto-approved
/ approved / rejected / executed).

### Logs and actions to follow — 2 pts ✓
LOGS button toggles to the `app-ticket-log` component which renders the audit log.
Tool call cards inside the chat view show the full command, exit code, and stdout
output. The technician can trace every step.

### Review, retry, and abort — 2 pts → ~1.5
ACCEPT / DECLINE buttons on every pending tool call card ✓. STOP button
(`chat-detail-view.component.html:213`) ✓. Technician can send a follow-up message
to resume after completion ✓. **No explicit "retry" button** — the technician must
use the message input to re-trigger the agent after a failure or rejection.

---

## E — Engineering Quality & Reproducibility (15 pts) — ~10–12

### Clean project structure — 3 pts ✓
Backend is split into `erp/`, `ssh/`, `agent/`, `api/`, and `db/` packages with
clear responsibility boundaries. Frontend uses Angular 22 standalone components
grouped by `pages/`, `components/`, `services/`, and `types/`.

### Real README — 3 pts → ~1
**The README is the original hackathon template and has not been updated.** It
describes a "React + Vite + TypeScript skeleton" (actual: Angular 22), references
frontend port `:5173` (actual: port 80 via Nginx), and states "backend only has
`/health`". The PostgreSQL service, multi-turn agent loop, approval gate, SSE
streaming, and audit log are not mentioned. A juror or grader following the README
will find instructions that do not match the running system. This is the most
actionable gap before submission.

### Tests or mocks — 3 pts ✓
- **Backend:** 932+ lines across `test_tickets.py`, `test_chats.py`,
  `test_audit_logs.py`, `test_customers.py`. All tests use `anyio` and override both
  the ERP dependency and DB session with `AsyncMock`. Tests run without Docker.
- **Frontend:** Vitest is configured and `*.spec.ts` files exist for components.

### Error handling + timeouts — 2 pts ✓
SSH connect timeout and command timeout in `config.py` (10 s / 60 s). `httpx` client
for Phoenix has an implicit 30 s timeout on the `create_activity` LLM call
(`orchestrator.py:316`). `PhoenixAPIError` subclasses give typed error handling.
SSE keepalive pings every 25 s prevent proxy timeouts.

### `.env` / secret handling — 2 pts ✓
`.env.example` present with all required variables documented. `.env` and `keys/`
are git-ignored (verified via `.gitignore`). No secrets committed to the repo.

### Modular code — 2 pts ✓
ERP client (`erp/client.py`), SSH runner (`ssh/runner.py`), safety layer
(`ssh/runner.py:CommandSafetyGuard`), agent orchestrator (`agent/orchestrator.py`),
and activity generator (`orchestrator.py:_generate_activity`) are all separate and
independently testable.

---

## Critical Gaps — Prioritised Action List

| # | Gap | Category | Effort | Estimated points at stake |
|---|-----|----------|--------|--------------------------|
| 1 | README describes the template, not the actual app | E | Low | ~2 pts |
| 2 | Status column missing from ticket list | A, D | Low | ~2–3 pts |
| 3 | No sort/filter UI controls in ticket list | A | Medium | ~1–2 pts |
| 4 | `echo`, `curl`, `find` auto-approved but can have side effects | C | Low | ~1–2 pts |
| 5 | Activity posted + ticket set DONE after every turn (multi-turn duplicates) | A, B | Medium | ~1 pt |
| 6 | Lorem ipsum placeholder in Notes section | D | Trivial | minor |
| 7 | stdout stored verbatim in audit log (potential secret exposure) | C | Medium | minor |
| 8 | No explicit "retry" button (only via message input) | D | Low | minor |

---

## Notes on B (Troubleshooting)

B is the biggest category (35 pts) and is graded entirely on fresh hidden VMs. The
agent's system prompt, SSH tooling, and safety layer are well-designed for this. The
most likely failure modes are:

- **Agent halts too early** (acceptance test fails but agent submits activity as done)
- **Multi-turn confusion** if the agent's message history grows stale
- **SSH key mapping** — `resolver.py` maps customer_id 5001–5005 to `case1–5_key.pem`;
  if the graders use different customer IDs the key lookup will raise `FileNotFoundError`
- **`echo` pipe commands being auto-approved** could mask technician oversight for
  fix steps that the jury expects to see an explicit approval for
