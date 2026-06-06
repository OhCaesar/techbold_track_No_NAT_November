"""Customer API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ...erp.client import PhoenixClient, get_phoenix_client
from ...erp.exceptions import PhoenixAPIError
from .schemas import CustomerResponse

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Get customer information",
    description="Retrieve a customer's details and associated system (SSH target) from the ERP.",
)
async def get_customer(
    customer_id: int,
    erp: PhoenixClient = Depends(get_phoenix_client),
) -> CustomerResponse:
    try:
        customer = await erp.get_customer(customer_id)
    except PhoenixAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail)) from exc

    return CustomerResponse.model_validate(customer, from_attributes=True)
