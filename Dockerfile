# Use the Python+Node.js image
FROM nikolaik/python-nodejs:python3.12-nodejs20

# Set working directory
WORKDIR /app

# Install Python dependencies globally (or user site) - we'll also install per-project via volume mount
COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN pip install --no-cache-dir -r /tmp/backend-requirements.txt 2>/dev/null || echo "No backend requirements.txt"

# Install Node.js dependencies globally (optional)
COPY frontend/package.json frontend/package-lock.json* /tmp/frontend/
RUN if [ -f /tmp/frontend/package.json ]; then \
      cd /tmp/frontend && npm ci --omit=dev 2>/dev/null || npm install --omit=dev; \
    fi

# ── Open WebUI isolated venv ────────────────────────────────────────
# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

# Create isolated venv for Open WebUI
RUN uv venv /opt/open-webui-env --python 3.12

# Install CPU-only PyTorch first (avoids ~2GB of CUDA/NVIDIA bloat)
RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      torch \
      --index-url https://download.pytorch.org/whl/cpu

# Install open-webui into the isolated venv
RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      open-webui

# Create data directory for Open WebUI persistence
RUN mkdir -p /app/open-webui-data

# Create directory structure
RUN mkdir -p /app/frontend /app/backend

# Default command: start an interactive shell
CMD ["/bin/bash"]
