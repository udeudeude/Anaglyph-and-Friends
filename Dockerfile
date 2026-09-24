# Production container for the hosted edition of Anaglyph & Friends.
# Local development is unchanged: Flask :8000 + Vite :5173.

FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# A dot keeps the existing `${apiUrl}/...` calls same-origin in production;
# local Vite still falls back to http://localhost:8000 when this variable is absent.
ENV VITE_FLASK_BACKEND_API_URL="."
RUN npm run build

FROM python:3.11-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AAF_TORCH_DEVICE=cpu \
    AAF_BROWSER_DEPTH=true \
    FLASK_HOST=0.0.0.0 \
    FLASK_PORT=8000

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-hosted.txt /app/backend/requirements-hosted.txt
RUN pip install -r /app/backend/requirements-hosted.txt

COPY backend/ /app/backend/
COPY --from=frontend /src/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/resources/session_data

WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "gunicorn -w 1 --threads 2 --timeout 300 -b 0.0.0.0:${PORT:-8000} production:app"]
