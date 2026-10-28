# Wind Forecast Trading Desk

Day-ahead decision support for the wind component of a UK energy utility's
power purchase. The desk answers two questions that the day-ahead team has to
answer before gate closure every afternoon:

1. **What is the latest wind generation forecast we can actually use, and when
   was it published?**
2. **How wrong has that forecast been, and what does that error cost us in
   thermal cover?**

Built on two Elexon BMRS datasets only — `FUELHH` (actual national wind
generation, half-hourly) and `WINDFOR` (national wind generation forecast, with
a `publishTime`) — for day-ahead purchase decisions covering **January 2026**.

```
React + TypeScript + Vite   →   nginx (static + /api proxy)
FastAPI + Python 3.13       →   SQLite warehouse seeded from Elexon BMRS
```

---

## Contents

| Path | What it is |
| --- | --- |
| `backend/` | FastAPI service, ingestion pipeline, analytics engine, tests |
| `backend/app/analytics.py` | Pure forecast-selection and accuracy maths (no I/O) |
| `backend/app/ingestion.py` | Elexon → SQLite pipeline, idempotent, run-audited |
| `backend/app/service.py` | Cached read model that shapes API payloads |
| `backend/app/main.py` | HTTP routes |
| `backend/data/wind_desk.db` | Pre-seeded January 2026 warehouse (ships with the image) |
| `backend/scripts/ingest.py` | CLI to refresh the warehouse |
| `backend/tests/` | 25 unit + contract tests |
| `frontend/` | React SPA: Desk overview, Forecast accuracy, Data ingestion |
| `docker-compose.yml` | Two-container stack (API + nginx-served SPA) |
| `Dockerfile` | Single-container image: builds the SPA, the API serves it (one-app hosts) |
| `deplexo.yaml` | Deplexo deployment config |
| `docs/design-reference/` | Stitch design reference used for the visual language |

The `backend/` and `frontend/` folders are deliberately independent: separate
dependency manifests, separate Dockerfiles, no shared package.

---

## Run it

### Docker (recommended)

```bash
docker compose up --build
```

* UI → <http://localhost:3000>
* API docs → <http://localhost:8000/docs>

The backend image ships with the January 2026 warehouse already seeded, so the
desk works immediately and does not depend on Elexon being reachable. A named
volume keeps refreshes across restarts.

### Local development

Terminal 1 — API:

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate     # or: source .venv/bin/activate
pip install -r requirements.txt
python scripts/ingest.py --summary                   # optional: re-pull from Elexon
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — UI:

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api to :8000
```

### Tests

```bash
cd backend && python -m pytest -q      # 25 passed
cd frontend && npm run build           # typecheck + production build
```

---

## How the forecast selection works

The whole product rests on one rule, implemented in
`backend/app/analytics.py:selection_cutoff`:

> A forecast may be used for a settlement period **only if** it was published
> **before day-ahead gate closure** (12:00 Europe/London on the day before
> delivery) **and at least `horizon` hours before that period starts**.

For every half-hourly settlement period the desk takes **the most recent
`WINDFOR` publication that satisfies both conditions**. That is the publication
the desk could genuinely have acted on, which is what makes the accuracy numbers
honest rather than hindsight-fitted.

The `horizon` control on screen is a what-if lever: *"how much staleness am I
willing to accept?"*. Because gate closure already forces a ~12.5h minimum lead,
horizons of 0–12h are equivalent — the UI says so explicitly rather than
pretending the settings differ.

### Metrics

| Metric | Definition | Why the desk cares |
| --- | --- | --- |
| MAE | mean \|forecast − actual\| | average MW of cover mis-positioned |
| RMSE | √mean(forecast − actual)² | same, weighted towards tail misses |
| Bias | mean(forecast − actual) | **sign** of the error: positive = over-forecast = short thermal cover |
| Centred MAE | MAE after removing the bias | pure forecast skill, comparable across horizons |
| Coverage | matched periods ÷ expected periods | where the data runs out |
| P90 shortfall | 90th percentile of (forecast − actual) | MW of cover to hold so 9 days in 10 are covered |

Blocks (2h, 4h) are aggregated before the error is computed, because power is
traded in blocks and error shrinks as the block lengthens.

---

## What the pilot found

These are results from the January 2026 data, surfaced in the Accuracy screen.

1. **`WINDFOR` is hourly, `FUELHH` is half-hourly.** Each hourly forecast value
   is applied to the two settlement periods it covers (step-hold). This is
   modelled explicitly and reported, not hidden inside a join.

2. **There is a large, level-dependent positive bias.** Mean forecast runs
   ~1.5–2 GW above metered actual, and the gap widens with output (actual ÷
   forecast falls from ≈0.91 at 4–8 GW to ≈0.77 at 20–24 GW). Random error does
   not behave that way. The shape points at a **boundary difference** between
   the metered transmission signal and the forecast's scope, which is why the
   product reports *centred MAE* alongside raw MAE and shows a bias-by-level
   diagnostic. This is the first thing to resolve with the client before any
   recalibration.

3. **A 48h lead requirement is barely satisfiable.** `WINDFOR` publishes roughly
   every 3 hours with ~60h of forward targets, so most delivery periods have no
   forecast published 48h ahead. Coverage drops and the UI flags it.

4. **The decision window is generous but not infinite.** At gate closure the
   newest publication still covers the whole delivery day; a 24h-stale
   publication only covers the morning.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness plus warehouse row counts |
| `GET` | `/api/meta` | Window, horizons, gate-closure rule, source list, last run |
| `GET` | `/api/desk?from&to&horizon&resolution` | Series, KPIs, daily roll-up, horizon ladder, cover guidance |
| `GET` | `/api/accuracy?from&to&horizon` | Horizon ladder, horizon × day matrix, diurnal profile, distribution, bias by level, method notes |
| `GET` | `/api/ingestion` | Source health, coverage spans, recent publications, run history |
| `POST` | `/api/ingest/refresh` | Re-pull from Elexon and invalidate the read model |

`resolution` accepts `30m`, `2h`, `4h`. `horizon` accepts 0–72 hours. All
responses are typed in `backend/app/schemas.py` and mirrored in
`frontend/src/lib/types.ts`.

---

## Configuration

Backend (`backend/app/config.py`), all optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WIND_DESK_DATA_DIR` | `backend/data` | Where the SQLite file lives |
| `CORS_ORIGINS` | localhost dev origins | Only needed when bypassing the nginx proxy |
| `ELEXON_BASE_URL` | public BMRS v1 | Point at a mock in tests |
| `ELEXON_TIMEOUT_SECONDS` | `45` | Upstream HTTP timeout |
| `PORT` | `8000` | Port uvicorn listens on; container hosts set it for you |

Frontend: `VITE_API_BASE_URL` (empty by default so requests stay same-origin)
and `BACKEND_UPSTREAM`, the address nginx proxies `/api` to. It is worked out at
container start and rendered into the nginx config there, so it can be changed
with an environment variable instead of a rebuild: set it to pin one address,
or leave it unset and the entrypoint probes `http://backend:8000` then
`http://backend:8080` and uses whichever answers `/api/health`, falling back to
`http://backend:8000`. The first line of the container log says which it chose.

---

## Deployment

The stack is Docker-native, so any container host works. **It has not been
deployed from this environment** — that needs the client's own account, so no
public URL is claimed here.

### Deplexo

Deplexo configures **one app per `deplexo.yaml`**, so the two-service
`docker-compose.yml` does not apply there. The root `Dockerfile` is the
single-container version: the UI is built at image build time and the API
serves it from the same origin. `/api/*` is the API and everything else is the
bundle, so there is no proxy, no second part, no CORS and no API URL baked into
the frontend.

1. **Deploy new → Git repository** and pick the repo. Deplexo reports
   “No deplexo.yaml found” until the commit with this file is pushed.
2. The root `deplexo.yaml` sets `build.framework: dockerfile`,
   `build.dockerfile: Dockerfile` and `run.port: 8000`. Explicit YAML values
   win over the dashboard, so the guessed framework and start command are
   unused. Root directory stays `./`.
3. Leave the environment variables alone. `PORT` may be any value: the image
   starts uvicorn on the `PORT` it is given and falls back to 8000.
4. `/api/health` should report `"status": "ok"` with 1,488 actuals, and `/`
   should serve the desk.

Notes:

* **Data.** `backend/data/wind_desk.db` is copied into the image at `/data`, so
  the desk is populated on first boot. `/data` is declared with `VOLUME`; mount
  a persistent volume there to keep a refresh across deploys, otherwise a new
  deploy starts again from the seeded January 2026 warehouse.
* **Refresh.** `POST /api/ingest/refresh` re-pulls FUELHH and WINDFOR from
  Elexon; it needs outbound HTTPS from the container and takes up to a minute.
* **Health check.** The image checks `/api/health` on `$PORT` every 30s, so a
  failed deploy shows up in the dashboard rather than on first page load.
* **Builds.** ~3–5 minutes on a cold cache; `npm ci` is cached in its own layer,
  so later deploys only rebuild what changed.

### Splitting the two parts

Hosting the API on Deplexo and the UI on Vercel works, but it is strictly more
moving parts than the single container above: two dashboards, two deploy
pipelines, a build-time API URL, and CORS.

* **API on Deplexo** — same `deplexo.yaml`, except the UI mount is skipped when
  no bundle is present. Add the Vercel origin(s) to `CORS_ORIGINS` (comma
  separated) or every browser request is refused.
* **UI on Vercel** — root directory `frontend`, build `npm run build`, output
  `dist`, and `VITE_API_BASE_URL=https://<api-app>.deplexo.com` at build time.
  That value is baked in at build time, so it must be updated if the API URL
  changes, and Vercel preview URLs each need their own `CORS_ORIGINS` entry.
* **No persistent disk on Vercel** — the SQLite warehouse and the FastAPI app
  cannot run there, which is why only the static UI moves.

Keep the single app unless there is a reason to split it.

### Other hosts

* **Render / Railway / Fly.io** — point the service at the root `Dockerfile`
  (one app), or use `docker-compose.yml` and keep the two parts separate.
* **Heroku** — `heroku container:push web` with the root `Dockerfile`.

None of these are claimed as done. They are the documented path.

---

## Assumptions and limitations

* **Window.** Delivery days 1–31 January 2026. Gate closure for 1 January falls
  on 31 December 2025, so the pulled forecast history starts a few days earlier.
* **National only.** No boundary flows, no regional split, no demand data — the
  brief scopes this to national wind.
* **Step-hold upsampling.** Hourly forecasts are held across both half-hours of
  the hour rather than interpolated; interpolation would invent precision the
  source does not have.
* **No price data**, so the cover guidance is expressed in MW, not £. Adding
  N2EX day-ahead prices would convert the P90 shortfall into a cost of risk and
  is the obvious next increment.
* **SQLite** is deliberate: one month of data is ~4 MB, so a single-file
  warehouse keeps the deployment self-contained. Swapping in Postgres is a
  `db.py` change.

---

## Design reference

The screen in `docs/design-reference/` came from a Stitch project and was used
as a **visual language only** — layout, density, typography (IBM Plex Sans +
JetBrains Mono), slate palette and single blue accent. Every figure on screen is
computed from Elexon data; nothing is mocked. Features visible in the reference
that are out of scope for this brief (N2EX spreads, B6 boundary flow,
curtailment and bids, system frequency) are **not** present in the product.

---

## AI tooling used

Built with AI assistance, disclosed as requested by the brief:

* **Stitch (Google)** — generated the reference screen used for the visual
  design language. No generated markup was copied; the React UI was written from
  scratch against the design tokens in `frontend/src/index.css`.
* **Claude (Anthropic)** — assisted with implementation, test scaffolding and
  documentation drafting. All logic was reviewed and verified against the live
  Elexon API; the analytics rules are pinned by unit tests.

---

## Data attribution

Contains public data from Elexon Insights Solution (BMRS): datasets `FUELHH` and
`WINDFOR`. Available at <https://bmrs.elexon.co.uk>.
