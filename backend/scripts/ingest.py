"""Seed the warehouse from Elexon BMRS.

    python scripts/ingest.py            # refresh the January 2026 dataset
    python scripts/ingest.py --summary  # refresh, then print a coverage report

Idempotent: rows are upserted on their natural keys, so re-running is safe.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import analytics, config, db, ingestion, service  # noqa: E402


def _summary() -> None:
    service.invalidate()
    snap = service.snapshot()
    periods = analytics.settlement_periods(config.WINDOW_START, config.WINDOW_END)
    print(f"\nWarehouse: {config.DB_PATH}")
    print(f"  actual periods stored : {len(snap.actuals):>6}")
    print(f"  forecast rows stored  : {snap.rows - len(snap.actuals):>6}")
    print(f"  expected periods      : {len(periods):>6}")
    print("\nCoverage by forecast horizon")
    print("  horizon   matched   coverage      MAE      bias")
    for horizon in config.HORIZONS:
        rows = analytics.build_rows(periods, snap.actuals, snap.book, horizon, 1)
        stats = analytics.summarise(rows)
        print(
            f"  {horizon:>5}h  {stats['matched']:>7}  "
            f"{stats['coverage_pct']:>8.1f}%  {stats['mae'] or 0:>8.1f}  "
            f"{stats['bias'] or 0:>8.1f}"
        )


async def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Elexon wind data")
    parser.add_argument(
        "--summary", action="store_true", help="print a coverage report afterwards"
    )
    args = parser.parse_args()

    result = await ingestion.run_ingest()
    print(
        f"[{result.status}] actual rows: {result.actual_rows}, "
        f"forecast rows: {result.forecast_rows}"
    )
    if result.status != "success":
        print(result.message, file=sys.stderr)
        return 1
    if args.summary:
        _summary()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
