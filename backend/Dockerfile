FROM nikolaik/python-nodejs:python3.12-nodejs20

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OPEN_WEBUI_VENV=/opt/open-webui-env \
    OPEN_WEBUI_PORT=8080 \
    OPEN_WEBUI_DATA_DIR=/data/open-webui

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl apt-transport-https lsb-release gnupg && \
    curl -sL https://aka.ms/InstallAzureCLIDeb | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/backend-requirements.txt
RUN pip install --no-cache-dir -r /tmp/backend-requirements.txt

RUN pip install --no-cache-dir uv
RUN uv venv /opt/open-webui-env --python 3.12
RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      torch \
      --index-url https://download.pytorch.org/whl/cpu
RUN uv pip install \
      --python /opt/open-webui-env/bin/python \
      open-webui

RUN mkdir -p /data/open-webui

COPY . /app

EXPOSE 8080

CMD ["sh", "-lc", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
