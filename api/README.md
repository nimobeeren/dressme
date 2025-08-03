# API

## Installation

1. Install the [uv](https://docs.astral.sh/uv/getting-started/installation/) package manager.

2. Make a copy of `.env.example` named `.env` and fill in the missing environment variables.

See `src/dressme/settings.py` for more information about the environment variables.

## Development

### Starting the server

Start a HTTP server for development:

```bash
uv run fastapi dev src/dressme/main.py
```

This will start a development server on `http://localhost:8000`.

### Adding test data

When you first start the backend, the database will be empty. To add some test data, you should set the `AUTH0_SEED_USER_ID` environment variable (in your `.env` file or your shell), then run the seed script:

```bash
uv run seed
```

This will add some wearables to the database stored in the `dressme.db` file.

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

(You should have all of these variables in your `.env` file)

You can then use this access token when making API requests, for example:

```bash
curl -X GET 'http://localhost:8000/wearables' \
    --header 'Authorization: Bearer $YOUR_ACCESS_TOKEN'
```

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

## Docker

You can run the API in a Docker container as follows:

1. Build the Docker image

```sh
docker build . -t dressme-api
```

2. Run a Docker container from the image

```sh
docker run -p 8000:8000 --env-file .env dressme-api
```

The API will then be available on `http://localhost:8000`.
