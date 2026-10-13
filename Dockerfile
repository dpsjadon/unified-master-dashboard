# ===============================================================
# IntelliSmart SBPDCL Unified Smart Meter Intelligence Platform
# Production Dockerfile for Render.com Deployment
# ===============================================================

FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8095 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver

# Install system utilities, Chromium and Chromedriver for Selenium automation
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and assets
COPY . .

# Expose default port (Render will dynamically supply $PORT)
EXPOSE 8095

# Launch Unified Platform server
CMD ["python", "server.py"]
