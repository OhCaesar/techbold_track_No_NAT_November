"""Response DTOs for the customers API.

These schemas decouple the public REST contract from the internal
ERP domain models, mirroring the same pattern used in the tickets API.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SystemInfoResponse(BaseModel):
    """Public representation of a customer's system (SSH target)."""

    model_config = ConfigDict(from_attributes=True)

    ip: str
    port: int
    username: str
    os: str
    notes: str | None = None


class CustomerResponse(BaseModel):
    """Public representation of a customer with their associated system."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    firstname: str
    lastname: str
    system: SystemInfoResponse
