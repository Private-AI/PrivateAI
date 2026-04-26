FROM nikolaik/python-nodejs:python3.12-nodejs20

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    BACKEND_HOST=127.0.0.1 \
    BACKEND_PORT=8000 \
    OPEN_WEBUI_VENV=/opt/open-webui-env \
    OPEN_WEBUI_DATA_DIR=/app/open-webui-data \
    OPEN_WEBUI_PORT=8080 \
    PUBLIC_OPEN_WEBUI_URL=/open-webui

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl apt-transport-https lsb-release gnupg && \
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN pip install --no-cache-dir -r /tmp/backend-requirements.txt

COPY frontend/package.json frontend/package-lock.json /app/frontend/
WORKDIR /app/frontend
RUN npm ci

WORKDIR /app
RUN pip install --no-cache-dir uv

RUN uv venv /opt/open-webui-env --python 3.12

RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      torch \
      --index-url https://download.pytorch.org/whl/cpu

RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      open-webui

COPY backend /app/backend
COPY frontend /app/frontend
COPY start-prod.sh /app/start-prod.sh

RUN sed -i 's/\r//' /app/start-prod.sh && \
    chmod +x /app/start-prod.sh && \
    mkdir -p /app/open-webui-data && \
    cd /app/frontend && npm run build

EXPOSE 3000

CMD ["/app/start-prod.sh"]
