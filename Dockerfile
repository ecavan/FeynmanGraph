FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

ARG GAMMALOOP_URL=https://github.com/ecavan/FeynmanGraph/releases/download/gammaloop-bin/gammaloop-linux-x86_64

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "$GAMMALOOP_URL" -o /usr/local/bin/gammaloop \
    && chmod +x /usr/local/bin/gammaloop \
    && test -x /usr/local/bin/gammaloop \
    && ls -lh /usr/local/bin/gammaloop

RUN pip install --no-cache-dir feynmangraph==0.1.2

EXPOSE 8000

CMD ["sh", "-c", "feynmangraph serve --host 0.0.0.0 --port ${PORT:-8000}"]
