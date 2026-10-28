FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WIND_DESK_DATA_DIR=/data

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The image ships with the January 2026 warehouse already seeded, so the desk
# is usable the moment the container starts and reviews do not depend on the
# Elexon API being reachable. Mount a volume here to persist refreshes.
# /app/data is where the code looks by default; point it at the seeded
# warehouse so an empty WIND_DESK_DATA_DIR still finds the data.
RUN ln -s /data /app/data

COPY data /data
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests

# Declared so container hosts that key persistent storage off VOLUME (rather
# than compose volumes) keep the SQLite file across restarts and deploys.
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
