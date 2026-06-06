from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

import httpx

from ..config import get_settings
from .exceptions import (
    PhoenixAPIError,
    PhoenixNotFoundError,
    PhoenixUnauthorizedError,
    PhoenixValidationError,
)
from .models import (
    Activity,
    ActivityCreate,
    Customer,
    CustomerSystem,
    Employee,
    SimpleMessage,
    Ticket,
    TicketStatus,
)


class PhoenixClient:
    def __init__(self, base_url: str, token: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._client.request(method, path, **kwargs)
        if response.status_code == 401:
            raise PhoenixUnauthorizedError(401, response.json().get("detail"))
        if response.status_code == 404:
            raise PhoenixNotFoundError(404, response.json().get("detail"))
        if response.status_code == 422:
            raise PhoenixValidationError(response.json().get("detail", []))
        if not response.is_success:
            raise PhoenixAPIError(response.status_code, response.text)
        return response.json()

    async def get_me(self) -> Employee:
        data = await self._request("GET", "/api/v1/me")
        return Employee.model_validate(data)

    async def list_tickets(
        self,
        *,
        status: TicketStatus | None = None,
        priority: str | None = None,
        sort: str | None = None,
    ) -> list[Ticket]:
        params: dict[str, str] = {}
        if status is not None:
            params["status"] = status
        if priority is not None:
            params["priority"] = priority
        if sort is not None:
            params["sort"] = sort
        data = await self._request("GET", "/api/v1/me/tickets", params=params)
        return [Ticket.model_validate(t) for t in data]

    async def get_ticket(self, ticket_id: int) -> Ticket:
        data = await self._request("GET", f"/api/v1/tickets/{ticket_id}")
        return Ticket.model_validate(data)

    async def get_customer_system(self, ticket_id: int) -> CustomerSystem:
        data = await self._request("GET", f"/api/v1/tickets/{ticket_id}/customer-system")
        return CustomerSystem.model_validate(data)

    async def set_ticket_status(self, ticket_id: int, status: TicketStatus) -> Ticket:
        data = await self._request(
            "PATCH",
            f"/api/v1/tickets/{ticket_id}/status",
            json={"status": status},
        )
        return Ticket.model_validate(data)

    async def get_customer(self, customer_id: int) -> Customer:
        data = await self._request("GET", f"/api/v1/customers/{customer_id}")
        return Customer.model_validate(data)

    async def create_activity(self, activity: ActivityCreate) -> Activity:
        data = await self._request(
            "POST",
            "/api/v1/activities/create",
            json=activity.model_dump(mode="json", exclude_none=True),
        )
        return Activity.model_validate(data)

    async def reset_me(self) -> SimpleMessage:
        data = await self._request("POST", "/api/v1/me/reset")
        return SimpleMessage.model_validate(data)


async def get_phoenix_client() -> AsyncGenerator[PhoenixClient, None]:
    s = get_settings()
    client = PhoenixClient(s.phoenix_api_base_url, s.phoenix_api_token)
    try:
        yield client
    finally:
        await client.close()
