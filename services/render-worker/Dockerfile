# Worker de renderização: precisa de PyTorch/YOLO e roda fora da Vercel.
FROM python:3.12-slim

# libgl/libglib: dependências nativas do OpenCV, mesmo na variante headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.lock.txt ./
# O lock fixa as versões do motor validado: atualizar pode mudar pixels.
RUN pip install --no-cache-dir -r requirements.lock.txt \
    && pip uninstall -y opencv-python || true

COPY app ./app
COPY engine ./engine
COPY templates ./templates
COPY assets ./assets

# Staging local; o produto final vai para o object storage.
RUN mkdir -p /tmp/autoweb-render

ENV PYTHONUNBUFFERED=1 \
    RENDER_CONCURRENCY=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health').status==200 else 1)"

# Um worker por processo: o motor é pesado e a fila é preferível à queda.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
