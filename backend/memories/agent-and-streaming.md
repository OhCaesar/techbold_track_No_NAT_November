# Agent & Streaming Architecture

## Overview

The agent pipeline is triggered by `POST /api/chats` and runs entirely in the background. The frontend subscribes to a Server-Sent Events stream and drives the human-in-the-loop approval flow via REST.

```
POST /api/chats  →  Chat row created (status="running")
                 →  start_agent(chat_id, ticket_id) enqueued as FastAPI BackgroundTask
                 →  returns ChatResponse immediately

GET /api/chats/{id}/stream  →  SSE connection, frontend subscribes
PATCH /api/chats/{id}/tool-calls/{id}  →  approve or reject a pending SSH command
```

---

## Module Map

| File | Role |
|------|------|
| `app/agent/agent.py` | pydantic-ai `Agent` definition, `TicketContext`, tools, `build_runner_for_customer` |
| `app/agent/orchestrator.py` | `start_agent()` — fetches ERP data, runs the agent, submits activity |
| `app/agent/approval_gate.py` | In-memory asyncio gate that pauses a tool until the technician approves |
| `app/agent/event_bus.py` | In-memory queue that fans SSE events from the background task to the subscriber |
| `app/agent/persistence.py` | Async DB helpers: `save_message`, `save_tool_call`, `update_tool_call_status`, `save_audit_log` |
| `app/api/chats/router.py` | HTTP endpoints: create chat, SSE stream, list tool calls, approve/reject |

---

## start_agent() — Orchestrator Flow

Located in `app/agent/orchestrator.py`. Called as a FastAPI `BackgroundTask`.

1. Open an `AsyncSessionLocal` DB session for the lifetime of the run.
2. Fetch `Ticket` and `CustomerSystem` from the Phoenix ERP via `PhoenixClient`.
3. Build a `FabricSSHRunner` using `build_runner_for_customer(customer_id, host, port, username, ticket_id)` — this calls `resolve_ssh_key` to pick the correct per-customer `.pem` file from `ssh_keys_dir`.
4. Construct `TicketContext(chat_id, ticket_id, host, port, description, runner)`.
5. Save the user prompt as a `ChatMessage(role="user")`.
6. Call `autopilot_agent.run_stream(prompt, deps=ctx)` — async context manager.
7. Iterate `result.stream_text(delta=True)` to get text tokens; for each token publish a `text_delta` SSE event.
8. After streaming ends, save the full assistant text as `ChatMessage(role="assistant")`.
9. Call `_generate_activity()` — a second OpenAI call with `response_format=json_object` that extracts the five activity fields (summary, root_cause, actions_taken, commands_summary, validation_result) from the narrative + audit logs.
10. `PhoenixClient.create_activity()` + `set_ticket_status(DONE)`.
11. Set `chat.status = "completed"`, publish `agent_completed` event, call `agent_event_bus.close()`.
12. On any exception: `chat.status = "failed"`, publish `agent_failed`, close bus.

---

## pydantic-ai Agent

Defined in `app/agent/agent.py`:

```python
autopilot_agent: Agent[TicketContext, str] = Agent(
    model="openai:gpt-4o",
    deps_type=TicketContext,
    system_prompt=SYSTEM_PROMPT,
)
```

- Result type is `str` — the agent produces a free-form troubleshooting narrative.
- The activity fields are extracted from that narrative in a separate pass (`_generate_activity`).
- Tools: `get_ticket_context` (sync) and `run_ssh_command` (async).

### Tool: get_ticket_context
Sync. Returns ticket_id, host, port, description from `ctx.deps`. No side effects.

### Tool: run_ssh_command
**Async** — pydantic-ai awaits it directly (not in a thread pool). This allows it to pause and wait for human approval.

Full flow inside the tool:
1. `deps.runner.safety_guard.check(command)` — raises `SSHCommandBlockedError` if dangerous; returns `"BLOCKED: ..."` string to the agent.
2. `save_tool_call(db, chat_id, "run_ssh_command", {command}, pydantic_call_id=ctx.tool_call_id)` → `ToolCall(status="pending")` in DB.
3. `agent_event_bus.publish(chat_id, {event: "tool_call_requested", tool_call_id, tool_name, args})` → SSE event to frontend.
4. `await approval_gate.request_approval(tool_call.id)` → **suspends here** until the technician responds.
5. If rejected: update status `"rejected"`, return `"Command rejected by technician."`.
6. `await asyncio.to_thread(deps.runner.run, command)` — Fabric SSH execution (sync runner, wrapped in thread so it doesn't block the event loop).
7. `save_audit_log(...)` + `save_message(role="tool", content=json)` + `update_tool_call_status("executed")`.
8. `agent_event_bus.publish(chat_id, {event: "tool_result", stdout, stderr, exit_code})`.
9. Returns formatted string `"exit_code: N\nstdout:\n...\nstderr:\n..."` — fed back to the LLM.

---

## ApprovalGate (`app/agent/approval_gate.py`)

Module-level singleton `approval_gate = ApprovalGate()`.

```python
# Tool calls this — suspends the coroutine
approved: bool = await approval_gate.request_approval(tool_call_id)

# HTTP endpoint calls this — unblocks the tool
approval_gate.resolve(tool_call_id, approved=True/False)
```

Internally: one `asyncio.Event` per pending tool call. `request_approval` creates the event and awaits it. `resolve` sets the event, which unblocks the awaiting coroutine.

**Important:** The gate is in-memory and tied to the event loop. It works because the background task and the HTTP handler share the same FastAPI event loop (single process).

---

## AgentEventBus (`app/agent/event_bus.py`)

Module-level singleton `agent_event_bus = AgentEventBus()`.

One `asyncio.Queue` per active chat. The background task publishes dicts; the SSE generator consumes them.

```python
# Background task / tools
await agent_event_bus.publish(chat_id, {"event": "text_delta", "content": "..."})

# SSE endpoint
q = agent_event_bus.subscribe(chat_id)
event = await asyncio.wait_for(q.get(), timeout=25)  # None sentinel = stream done
```

`agent_event_bus.close(chat_id)` puts `None` into the queue (sentinel) and removes the entry.

---

## SSE Stream (`GET /api/chats/{chat_id}/stream`)

Uses `sse-starlette` (`EventSourceResponse`). The generator:
- Calls `agent_event_bus.subscribe(chat_id)` to get the queue.
- Loops with a 25-second `asyncio.wait_for` timeout; on timeout yields a `ping` keepalive.
- On receiving an event dict, pops the `"event"` key and yields `{event: type, data: json}`.
- On receiving `None` sentinel, breaks and closes.

### SSE Event Types

| event | data fields | when |
|-------|-------------|------|
| `text_delta` | `content` | LLM produces a text token |
| `tool_call_requested` | `tool_call_id`, `tool_name`, `args` | SSH command awaiting approval |
| `tool_call_approved` | `tool_call_id` | Technician approved |
| `tool_call_rejected` | `tool_call_id` | Technician rejected |
| `tool_result` | `tool_call_id`, `stdout`, `stderr`, `exit_code`, `blocked` | Command executed |
| `agent_completed` | `summary` | Run finished, activity submitted |
| `agent_failed` | `error` | Unhandled exception |
| `ping` | _(none)_ | 25s keepalive |

---

## Approval Flow (HTTP)

`PATCH /api/chats/{chat_id}/tool-calls/{tool_call_id}` with body `{"approved": bool}`:

1. Loads `ToolCall` from DB, validates it belongs to `chat_id` and is `status="pending"`.
2. Sets `tool_call.status = "approved"` or `"rejected"`, sets `resolved_at`.
3. Commits to DB.
4. Calls `approval_gate.resolve(tool_call_id, approved)` — this unblocks the waiting `run_ssh_command` coroutine.
5. Publishes `tool_call_approved` or `tool_call_rejected` SSE event.
6. Returns `ToolCallResponse`.

After unblocking, the tool continues: if approved it runs the SSH command (step 6–9 above); if rejected it returns immediately.

---

## DB Models Used

- **`Chat`** — one per technician session. `status`: `running → completed/failed`.
- **`ChatMessage`** — every message in the conversation (`role`: `user/assistant/tool`). Ordered by `sequence`.
- **`ToolCall`** — one per `run_ssh_command` invocation. `status`: `pending → approved/rejected → executed/blocked`.
- **`AuditLog`** — one per executed SSH command. Always written even on non-zero exit. Contains full `stdout`, `stderr`, `exit_code`, `duration_ms`.

---

## SSH Key Resolution

`build_runner_for_customer(customer_id, host, port, username, ticket_id)` in `agent.py`:
- Calls `resolve_ssh_key(customer_id, keys_dir=settings.ssh_keys_dir)` from `ssh/resolver.py`.
- Convention: `customer_id 5001 → /keys/case1_key.pem`, `5002 → case2_key.pem`, etc.
- `ssh_keys_dir` defaults to `/keys` (set in `config.py`, overridable via env).

The `username` comes from `CustomerSystem.system.username` (returned by the ERP).

---

## Config Variables Relevant to the Agent

| Variable | Default | Notes |
|----------|---------|-------|
| `OPENAI_API_KEY` | `""` | Required for agent + activity extraction |
| `OPENAI_MODEL` | `gpt-4o` | Used for both agent and `_generate_activity` |
| `SSH_KEYS_DIR` | `/keys` | Directory containing `case{n}_key.pem` files |
| `SSH_CONNECT_TIMEOUT` | `10` | Seconds, passed to Fabric |
| `SSH_COMMAND_TIMEOUT` | `60` | Seconds, per command |
| `PHOENIX_API_BASE_URL` | `http://host.docker.internal:8000` | ERP endpoint |
| `PHOENIX_API_TOKEN` | `""` | Bearer token for ERP |
