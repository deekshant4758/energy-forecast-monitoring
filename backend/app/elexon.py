"""Thin asynchronous client for the Elexon BMRS public data API.

Only two datasets are in scope for the pilot:

* ``FUELHH``  - half-hourly actual generation by fuel type. We keep ``WIND``.
* ``WINDFOR`` - national wind generation forecasts, each with a ``publishTime``
  so we can reconstruct exactly what the desk knew at decision time.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import httpx

from . import config

logger = logging.getLogger(__name__)


class ElexonError(RuntimeError):
    """Raised when the Elexon API cannot be read."""


def _iso_z(moment: datetime) -> str:
    """Format an aware datetime the way the BMRS API expects."""
    return moment.astimezone(config.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _daterange(start: date, end: date, step_days: int) -> Iterable[tuple[date, date]]:
    cursor = start
    while cursor <= end:
        chunk_end = min(cursor + timedelta(days=step_days - 1), end)
        yield cursor, chunk_end
        cursor = chunk_end + timedelta(days=1)


class ElexonClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> "ElexonClient":
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=config.ELEXON_BASE_URL,
                timeout=config.HTTP_TIMEOUT_SECONDS,
                headers={"Accept": "application/json"},
            )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("ElexonClient must be used as an async context manager")
        return self._client

    async def _get(self, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        last_error: Exception | None = None
        for attempt in range(1, config.HTTP_RETRIES + 1):
            try:
                response = await self.client.get(path, params=params)
                if response.status_code == 200:
                    payload = response.json()
                    return list(payload.get("data") or [])
                if response.status_code == 400:
                    # Validation errors are not worth retrying.
                    raise ElexonError(
                        f"{path} rejected the request: {response.text[:300]}"
                    )
                last_error = ElexonError(
                    f"{path} returned HTTP {response.status_code}: {response.text[:200]}"
                )
            except (httpx.HTTPError, ValueError) as exc:  # network / decode problems
                last_error = exc
            backoff = min(2 ** (attempt - 1), 8)
            logger.warning(
                "Elexon request failed (attempt %s/%s), retrying in %ss: %s",
                attempt,
                config.HTTP_RETRIES,
                backoff,
                last_error,
            )
            await asyncio.sleep(backoff)
        raise ElexonError(f"Elexon request to {path} failed: {last_error}")

    async def fetch_wind_actuals(self, start: date, end: date) -> list[dict[str, Any]]:
        """Half-hourly actual wind generation between two settlement dates."""
        rows: list[dict[str, Any]] = []
        for chunk_start, chunk_end in _daterange(
            start, end, config.ELEXON_MAX_DAYS_PER_REQUEST
        ):
            payload = await self._get(
                "/datasets/FUELHH",
                {
                    "settlementDateFrom": chunk_start.isoformat(),
                    "settlementDateTo": chunk_end.isoformat(),
                    "format": "json",
                },
            )
            rows.extend(row for row in payload if row.get("fuelType") == "WIND")
        return rows

    async def fetch_wind_forecasts(
        self, published_from: datetime, published_to: datetime
    ) -> list[dict[str, Any]]:
        """Every WINDFOR publication inside a publish-time window."""
        rows: list[dict[str, Any]] = []
        step = config.ELEXON_MAX_DAYS_PER_REQUEST
        cursor = published_from
        while cursor < published_to:
            chunk_end = min(cursor + timedelta(days=step), published_to)
            payload = await self._get(
                "/datasets/WINDFOR",
                {
                    "publishDateTimeFrom": _iso_z(cursor),
                    "publishDateTimeTo": _iso_z(chunk_end),
                    "format": "json",
                },
            )
            rows.extend(payload)
            cursor = chunk_end
        return rows
