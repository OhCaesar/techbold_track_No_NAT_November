FROM python:3.11-slim

# Create a non-root user so the container doesn't run as root.
RUN groupadd -r app --gid 1000 && useradd -r -g app --uid 1000 app

WORKDIR /app

# Install both standard and development requirements
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy the application code, tests, and pytest configuration
COPY app ./app
COPY tests ./tests
COPY pytest.ini ./

# Pre-create the /keys mountpoint with correct ownership (similar to the main Dockerfile)
RUN mkdir -p /keys && chown app:app /keys

# Set correct ownership for the application directory
RUN chown -R app:app /app
USER app

# Run pytest by default
CMD ["pytest"]
