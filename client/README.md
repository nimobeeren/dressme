# Client

## Installation

Install dependencies:

```bash
pnpm install
```

## Development

Start a development server:

```bash
pnpm run dev
```

You can then view the app at `http://localhost:5173/`.

<!-- TODO: document how this also runs the backend -->

### Viewing API Logs

API logs are not shown by default. To see them, first look up the Docker container ID:

```bash
docker ps
```

Look for an entry with image name `cloudflare-dev/dressmeapi` and copy its container ID.

Then view the logs:

```bash
docker logs -f <CONTAINER_ID>
```

You should also see new logs coming in when you interact with the API.

### Generating API Client

A TypeScript client is generated in `./src/api` to easily interact with the API. When the API is changed, you should re-generate this client to stay up-to-date:

```bash
pnpm run generate-client
```

Note that the API server must be running for this to work.

## Deployment

Deploy to Cloudflare Workers:

```bash
pnpm run deploy
```

NOTE: the API currently uses environment vars from the `.env` file in production, not from `.env.production`
