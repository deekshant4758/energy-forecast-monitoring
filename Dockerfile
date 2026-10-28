# One container that is both the API and the desk UI.
#
# Hosts that deploy a single app from one Dockerfile (Deplexo) cannot run the
# two services in docker-compose.yml, so here the UI build is served by the API
# itself: /api is the API, everything else is the built bundle. docker-compose.yml
# still runs the two parts separately (nginx in front of the API) for local work.

FROM node:22-alpine AS ui

WORKDIR /ui

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WIND_DESK_DATA_DIR=/data \
    PORT=8000

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The image ships with the January 2026 warehouse already seeded, so the desk
# is usable the moment the container starts and reviews do not depend on the
# Elexon API being reachable. Mount a volume here to persist refreshes.
# /app/data is where the code looks by default; point it at the seeded
# warehouse so an empty WIND_DESK_DATA_DIR still finds the data.
COPY backend/data /data
RUN ln -s /data /app/data

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/tests ./tests

# Served by app.main at / when present; see WIND_DESK_FRONTEND_DIST.
COPY --from=ui /ui/dist ./frontend_dist

# Keeps the SQLite warehouse across restarts and deploys on hosts that key
# persistent storage off VOLUME.
VOLUME ["/data"]

# Hosts pick the port and pass it in PORT (Deplexo defaults to 3000);
# compose leaves it unset, so the API keeps listening on its documented 8000.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % (os.environ.get('PORT') or '8000'))"

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
