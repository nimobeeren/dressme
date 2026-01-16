# API

## Installation

Some development commands require the [uv](https://docs.astral.sh/uv/getting-started/installation/) package manager. No other setup is required for the API.

## Environment variables

See `src/dressme/settings.py` for more information about the environment variables.

## Development

To run the API locally, follow these steps.

1. Start a local PostgreSQL server:

```bash
docker compose up
```

You can check that the server is running and interact with it by running `psql postgresql://dressme:dressme@localhost:5432/dressme`.

2. Start the client which will also start the API server:

```bash
cd ../client
pnpm run dev
```

### Adding test data

When you first start the backend, the database will be empty. To add some test data, you should set the `AUTH0_SEED_USER_ID` environment variable (in your `.env` file or your shell), then run the seed script:

```bash
uv run seed
```

This will add some wearables to the database.

### Getting an access token

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

### Running with Docker

It may be useful to run the application locally in a Docker container to match the deployed environment more closely. You can do so as follows:

1. Build the Docker image:

```bash
docker build . -t dressme-api
```

2. Run a Docker container from the image using your local env vars:

```bash
docker run -p 8000:8000 --env-file .env dressme-api
```

The API will then be available on `http://localhost:8000`.

## Testing

Run the tests:

```bash
uv run pytest
```

## Type checking

Run the type checker:

```bash
uv run pyright
```

## Deployment

The API is deployed automatically when deploying the client (see [client README](../client/README.md)).
