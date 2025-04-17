# API

## Installation

```bash
poetry install
```

## Development

### Seeding the database

The first time you run this app, you need to create the database and insert some test data:

```bash
poetry run python -m wardrobe.db.seed
```

This will create a file named `wardrobe.db` containing some test data.

### Starting the server

Start a HTTP server for development:

```bash
poetry run fastapi dev main.py
```

This will start a development server on `http://localhost:8000`.

### Getting an access token

To make API requests, you'll need to pass a valid access token. You can get an access token that is valid for 24 hours from Auth0 like this:

```bash
curl -X POST 'https://$AUTH0_DOMAIN/oauth/token' \
--header 'Content-Type: application/json' \
--data '{
    "client_id": "$AUTH0_CLIENT_ID",
    "client_secret": "$AUTH0_CLIENT_SECRET",
    "audience": "https://dressme.local",
    "grant_type": "client_credentials"
}'
```

## Testing

Run the tests:

```bash
poetry run pytest
```
