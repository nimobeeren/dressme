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
- Neon
- Cloudflare Containers
- Replicate

## Repository Structure

- 📁 [`.github`](./.github): GitHub Actions CI configuration
- 📁 [`api`](./api): the backend API
- 📁 [`images`](./images): sample images for seeding the development database
- 📁 [`src`](./src): the frontend client source code
- 📁 [`worker`](./worker): the Cloudflare Worker entrypoint

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

All environment variables are stored in `.env` (see `.env.example` for the template). Variables prefixed with `VITE_` are used by the client. See [`settings.py`](./api/src/dressme/settings.py) for documentation of environment variables used by the API. Note that environment variables need to be explicitly forwarded to the API container in [`worker/index.ts`](./worker/index.ts) when running with Wrangler.

## Usage

### Full App (with Wrangler)

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

API logs are not shown by default when running with Wrangler. To view them while the API is running:

```bash
pnpm run api-logs
```

Note that you need to make a request to the client before the API will start.

If you need to do it manually, look up the Docker container ID with `docker ps` (image name `cloudflare-dev/dressmeapi`), then run `docker logs -f <CONTAINER_ID>`.

### Standalone API (with uv)

Faster to start and iterate when working on the API only.

```bash
# Run required services
docker compose up -d
# Start the API
cd api
uv run fastapi dev src/dressme/main.py
```

The API will be available at `http://localhost:8000`.

### Standalone API (with Docker)

Faster than running the whole app, but matches the production environment more closely than running directly with uv.

```bash
# Run required services
docker compose up -d
# Build and run the API
docker build api/ -t dressme-api
docker run -p 8000:8000 --env-file .env dressme-api
```

The API will be available at `http://localhost:8000`.

## Development

### Client

#### Tests

Run the tests:

```bash
pnpm test
```

#### Type Checking

Run the type checker:

```bash
pnpm typecheck
```

#### Linting

Run the linter:

```bash
pnpm lint
```

#### Generating API Client

A TypeScript client is generated in `src/api` to easily interact with the API. When the API is changed, you should re-generate this client to stay up-to-date:

```bash
pnpm generate-client
```

Note that the API server must be running for this to work.

### API

#### Tests

Run the tests:

```bash
cd api
uv run pytest
```

#### Type Checking

Run the type checker:

```bash
cd api
uv run pyright
```

#### Adding Test Data

When you first start the backend, the database will be empty. To add some test data, set the `AUTH0_SEED_USER_ID` environment variable (in your `.env` file or your shell), then run the seed script:

```bash
cd api
uv run seed
```

This will add some wearables to the database.

#### Getting an Access Token

When making API requests, you'll need to pass a valid access token. The frontend gets this token automatically from Auth0 after you log in, but you can also get it yourself by making a request like this:

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
