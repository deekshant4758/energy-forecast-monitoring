"""HTTP contract tests.

These run against whatever is in the warehouse. If the database has not been
seeded (fresh clone before ``scripts/ingest.py``) the data-dependent assertions
are skipped rather than failed, so CI stays honest about what it checked.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    db.init_db()
    return TestClient(app)


@pytest.fixture(scope="module")
def seeded(client: TestClient) -> bool:
    return client.get("/api/health").json()["actuals"] > 0


def test_health_reports_the_warehouse(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "empty"}
    assert "actuals" in body


def test_meta_exposes_the_decision_rule(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    assert body["window"]["from"] == "2026-01-01"
    assert body["window"]["to"] == "2026-01-31"
    assert body["default_horizon"] == 4
    assert body["gate_closure"]["hour"] == 12
    assert {source["dataset"] for source in body["sources"]} == {"FUELHH", "WINDFOR"}


def test_desk_rejects_a_reversed_window(client: TestClient) -> None:
    response = client.get("/api/desk", params={"from": "2026-01-10", "to": "2026-01-05"})
    assert response.status_code == 422


def test_desk_rejects_an_unknown_resolution(client: TestClient) -> None:
    response = client.get("/api/desk", params={"resolution": "7m"})
    assert response.status_code == 422


def test_desk_returns_a_complete_week_of_settlement_periods(
    client: TestClient, seeded: bool
) -> None:
    if not seeded:
        pytest.skip("warehouse not seeded; run scripts/ingest.py")
    body = client.get(
        "/api/desk", params={"from": "2026-01-01", "to": "2026-01-07", "horizon": 4}
    ).json()
    assert len(body["series"]) == 7 * 48
    assert body["granularity_minutes"] == 30
    first = body["series"][0]
    assert first["sp"] == 1
    assert first["status"] == "CLEARED"
    assert body["kpis"]["matched"] > 0
    assert body["kpis"]["mae"] is not None


def test_two_hour_resolution_aggregates_to_quarter_hours(
    client: TestClient, seeded: bool
) -> None:
    if not seeded:
        pytest.skip("warehouse not seeded; run scripts/ingest.py")
    body = client.get(
        "/api/desk", params={"from": "2026-01-01", "to": "2026-01-01", "resolution": "2h"}
    ).json()
    assert body["granularity_minutes"] == 120
    assert len(body["series"]) == 12


def test_accuracy_covers_every_horizon(client: TestClient, seeded: bool) -> None:
    if not seeded:
        pytest.skip("warehouse not seeded; run scripts/ingest.py")
    body = client.get("/api/accuracy", params={"horizon": 4}).json()
    assert [entry["horizon"] for entry in body["horizons"]] == [0, 4, 12, 24, 36, 48]
    assert body["matrix"]
    assert body["by_settlement_period"]
    assert body["bias_by_level"]
    assert any(note["title"] for note in body["notes"])


def test_ingestion_status_lists_the_sources(client: TestClient) -> None:
    body = client.get("/api/ingestion").json()
    assert {source["dataset"] for source in body["sources"]} == {"FUELHH", "WINDFOR"}
    assert "runs" in body
