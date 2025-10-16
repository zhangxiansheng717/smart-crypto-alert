FROM python:3.11-slim

WORKDIR /app

# Install TA-Lib C library and build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download and compile TA-Lib C library
RUN wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib/ && \
    ./configure --prefix=/usr && \
    make && \
    make install && \
    cd .. && \
    rm -rf ta-lib ta-lib-0.4.0-src.tar.gz

# Update library cache
RUN ldconfig

# Install Python dependencies
COPY requirements.txt .

# Install numpy first (TA-Lib dependency)
RUN pip install --no-cache-dir numpy==1.23.5

# Install TA-Lib Python wrapper
RUN pip install --no-cache-dir TA-Lib==0.4.24

# Install remaining dependencies
RUN pip install --no-cache-dir Flask==3.0.0 flask-cors==4.0.0 gunicorn==21.2.0

# Copy service code
COPY pattern_service.py .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "pattern_service:app"]

