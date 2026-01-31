# Based on: https://github.com/astral-sh/uv-docker-example

# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Create non-root user
RUN useradd --create-home --no-log-init appuser
WORKDIR /app
RUN chown appuser:appuser /app
USER appuser

# Copy files needed for installing dependencies
COPY --chown=appuser:appuser pyproject.toml uv.lock ./

# Sync the project into a new environment, asserting the lockfile is up to date
# Use --no-install-project because this requires the source code to be present
RUN uv sync --locked --no-dev --no-install-project

# Copy source code and install project
COPY --chown=appuser:appuser . .
RUN uv sync --locked --no-dev

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Reset the entrypoint, don't invoke `uv`
ENTRYPOINT []

# Indicate the port the app listens on
EXPOSE 8000

# Run the FastAPI application by default
# Uses `--host 0.0.0.0` to allow access from outside the container
CMD ["fastapi", "run", "--host", "0.0.0.0", "--port", "8000", "src/dressme/main.py"]
