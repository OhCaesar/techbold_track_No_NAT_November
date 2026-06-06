"""Shared test fixtures.

anyio_backend is overridden here to restrict async test execution to asyncio
only, preventing anyio from parametrizing tests against trio.

The FastAPI app uses a lifespan that calls init_db() which requires a real
Postgres connection. For unit tests we override the lifespan to a no-op so
tests can run without any external services.
"""

from __future__ import annotations

import os

# Set dummy OpenAI credentials to prevent initialization failures during tests
os.environ.setdefault("OPENAI_API_KEY", "mock-key-for-testing")

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.erp.client import PhoenixClient, get_phoenix_client


@pytest.fixture
def anyio_backend() -> str:
    """Run all async tests under asyncio only (not trio)."""
    return "asyncio"


def _create_test_app() -> FastAPI:
    """Build a FastAPI app with a no-op lifespan (no DB required)."""

    @asynccontextmanager
    async def _noop_lifespan(app: FastAPI):
        yield

    test_app = FastAPI(lifespan=_noop_lifespan)

    # Re-use the real API router
    from app.api import api_router

    test_app.include_router(api_router)
    return test_app


@pytest.fixture
def mock_erp_client() -> AsyncMock:
    """A fully mocked PhoenixClient."""
    return AsyncMock(spec=PhoenixClient)


@pytest.fixture
def mock_db() -> AsyncMock:
    """A fully mocked AsyncSession."""
    return AsyncMock(spec=AsyncSession)


@pytest.fixture
async def client(mock_erp_client: AsyncMock) -> AsyncIterator[AsyncClient]:
    """Async HTTP test client with the ERP dependency overridden."""
    test_app = _create_test_app()

    async def _override_erp():
        yield mock_erp_client

    test_app.dependency_overrides[get_phoenix_client] = _override_erp

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    test_app.dependency_overrides.clear()


@pytest.fixture
async def client_with_db(
    mock_erp_client: AsyncMock,
    mock_db: AsyncMock,
) -> AsyncIterator[AsyncClient]:
    """Async HTTP test client with both the ERP and DB dependencies overridden."""
    test_app = _create_test_app()

    async def _override_erp():
        yield mock_erp_client

    async def _override_db():
        yield mock_db

    test_app.dependency_overrides[get_phoenix_client] = _override_erp
    test_app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    test_app.dependency_overrides.clear()
