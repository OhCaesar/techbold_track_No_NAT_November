FROM python:3.11-slim

# Create a non-root user so the container doesn't run as root.
# Using a fixed UID/GID (1000) matches the typical default host user,
# which ensures bind-mounted files (e.g. ./keys) are readable even in
# rootless Docker where container root ≠ host root.
RUN groupadd -r app --gid 1000 && useradd -r -g app --uid 1000 app

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

# Pre-create the /keys mountpoint with correct ownership so the app user
# can read files bind-mounted there at runtime.
RUN mkdir /keys && chown app:app /keys

RUN chown -R app:app /app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
