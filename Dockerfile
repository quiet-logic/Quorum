FROM python:3.12-slim

# Install Node.js (for frontend build)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build
COPY legal-study-app/package*.json legal-study-app/
RUN cd legal-study-app && npm install
COPY legal-study-app/ legal-study-app/
RUN cd legal-study-app && npm run build

# App source
COPY . .

EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "app:app"]
