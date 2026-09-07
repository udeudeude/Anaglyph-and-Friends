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
    FLASK_HOST=0.0.0.0 \
    FLASK_PORT=8000

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

# The original project keeps Depth Anything V2 source and model weights out of
# git. A hosted build reconstructs those dependencies from the official project.
RUN git clone --depth 1 https://github.com/DepthAnything/Depth-Anything-V2.git /tmp/depth-anything \
    && mkdir -p /app/backend/ai_models/Depth_Anything_V2 \
    && cp -R /tmp/depth-anything/depth_anything_v2 /app/backend/ai_models/Depth_Anything_V2/ \
    && mkdir -p /app/backend/ai_models/checkpoints \
    && python - <<'PY'
import urllib.request
url = 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth'
out = '/app/backend/ai_models/checkpoints/depth_anything_v2_vits.pth'
urllib.request.urlretrieve(url, out)
print('Downloaded Depth Anything V2 Small checkpoint')
PY

COPY backend/ /app/backend/
COPY --from=frontend /src/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/resources/session_data

WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "gunicorn -w 1 --threads 2 --timeout 300 -b 0.0.0.0:${PORT:-8000} production:app"]
