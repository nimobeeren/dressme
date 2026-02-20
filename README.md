# dressme

A virtual wardrobe that shows you how clothes look on you.

## Demo

[!Demo video](https://github.com/user-attachments/assets/0fa75362-c705-416c-bdb5-738ddb5e8c99)

## Tech Stack

- shadcn/ui
- Tailwind
- React
- Auth0
- FastAPI
- SQLModel
- PostgreSQL
- Neon
- Cloudflare Containers
- Replicate

## Repository Structure

- 📁 `[.github](./.github)`: GitHub Actions CI configuration
- 📁 `[api](./api)`: the backend API
- 📁 `[images](./images)`: sample images for seeding the development database
- 📁 `[src](./src)`: the frontend client source code
- 📁 `[worker](./worker)`: the Cloudflare Worker entrypoint

## Installation

1. Install the required tools:

- [Docker](https://docs.docker.com/get-docker/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [pnpm](https://pnpm.io/installation)

2. Install dependencies:

```bash
pnpm install
```

3. Copy the example environment file and fill in the missing values:

```bash
cp .env.example .env
```

## Environment Variables

### API

See `[settings.py](./api/src/dressme/settings.py)` for documentation of environment variables used by the API. Note that environment variables need to be explicitly forwarded to the API container in `[worker/index.ts](./worker/index.ts)` when running through the worker (both for development and production).

#### Development

All environment variables are sourced from `.env` (see `.env.example` for the template).

#### Production

Production environment variables for the API are managed via the Cloudflare dashboard or the Wrangler CLI:

```bash
pnpm wrangler secret list
pnpm wrangler secret put <SECRET_NAME>
```

### Client

#### Development

All environment variables are sourced from `.env` (see `.env.example` for the template).

Some environment variables are not needed to run tests, because they don't rely on external services. To allow settings validation to pass without weakening types by allowing `None`, placeholder values are set in the `[tool.pytest_env]` section in `[pyproject.toml](./api/pyproject.toml)`.

#### Production

Production environment variables for the client are sourced from `.env` and set on build/deploy. Only variables starting with `VITE_` are included. To use different values in production than in local development, create a `.env.production` file with only the variables you want to override.

### Blob Storage (MinIO / R2)

#### Development

For local development, we use [MinIO](https://min.io/) as an S3-compatible object storage. It requires no extra configuration when copying the default values from `.env.example`. You can access the MinIO console at `http://localhost:9001` with the credentials `minioadmin/minioadmin`.

#### Production

In production, we use Cloudflare R2 with a scoped-down API token that only has permission to read and write objects in specific buckets. A new API token can be created in the Cloudflare dashboard under **R2 > API Tokens > Manage**.

## Development Tasks

### Running the App

Runs both the client and API together, similar to the production setup.

```bash
# Run required services
docker compose up -d
# Start the app (rebuilds container)
pnpm run dev
```

The client will be available at `http://localhost:5173`. After making an (authenticated) request to the client, the API will start and be available at `http://localhost:8000`.

Changes to the client and worker are auto-reloaded, but changes to the API require a restart to take effect.

#### Viewing API Logs

API logs are not shown by default when running with `pnpm run dev`. To view them while the API is running:

```bash
pnpm run api-logs
```

Note that you need to make a request to the client before the API will start.

If you need to do it manually, look up the Docker container ID with `docker ps` (image name `cloudflare-dev/dressme`), then run `docker logs -f <CONTAINER_ID>`.

### Running Standalone API (with uv)

Faster to start and iterate when working on the API only.

```bash
# Run required services
docker compose up -d
# Start the API
cd api
uv run fastapi dev src/dressme/main.py
```

The API will be available at `http://localhost:8000`.

### Running Standalone API (with Docker)

Faster than running the whole app, but matches the production environment more closely than running directly with uv.

```bash
# Run required services
docker compose up -d
# Build and run the API
docker build api/ -t dressme-api
docker run -p 8000:8000 --env-file .env dressme-api
```

The API will be available at `http://localhost:8000`.

### Inspecting the Database

While `docker compose` is running, you can interact with the local PostgreSQL database using:

```sh
psql postgresql://dressme:dressme@localhost:5432/local
```

### Code Checks

#### Client

```bash
pnpm test
pnpm typecheck
pnpm lint
```

#### API

```bash
cd api
uv run pytest
uv run pyright  # type checking
```

### Generating API Client

A TypeScript client is generated in `src/api` to easily interact with the API. When the API is changed, you should re-generate this client to stay up-to-date:

```bash
pnpm generate-client
```

Note that the API server must be running for this to work.

### Adding Test Data

When you first start the backend, the database will be empty. To add some test data, set the `AUTH0_SEED_USER_ID` environment variable (in your `.env` file or your shell), then run the seed script:

```bash
cd api
uv run seed
```

This will add some wearables to the database.

### Dropping the Database

To reset your local database, stop the containers and remove the volume:

```bash
docker compose down -v
```

### Getting an Access Token

When making API requests, you'll need to pass a valid access token. The client gets this token automatically from Auth0 after you log in, but you can also get it yourself by making a request like this:

```bash
curl -X POST 'https://$AUTH0_DOMAIN/oauth/token' \
    --header 'Content-Type: application/json' \
    --data '{
        "client_id": "$AUTH0_CLIENT_ID",
        "client_secret": "$AUTH0_CLIENT_SECRET",
        "audience": "$AUTH0_API_AUDIENCE",
        "grant_type": "client_credentials"
    }'
```

(You can get these variables from the [Auth0 Dashboard](https://manage.auth0.com/), and you probably already have some in your `.env` file)

You can then use this access token when making API requests, for example:

```bash
curl -X GET 'http://localhost:8000/wearables' \
    --header 'Authorization: Bearer $YOUR_ACCESS_TOKEN'
```

## Deployment

The app is deployed to Cloudflare using:

```bash
pnpm run deploy
```

This deploys both the client (Cloudflare Workers) and the API (Cloudflare Containers).
