# dressme

A virtual wardrobe that shows you how clothes look on you.

## Demo

[!Demo video](https://github.com/user-attachments/assets/0fa75362-c705-416c-bdb5-738ddb5e8c99)

## Tech Stack

- shadcn/ui
- Tailwind
- React
- Auth0
- Drizzle
- PostgreSQL
- Neon
- Vercel
- Replicate
- Google Gemini

## Installation

1. Install the required tooling:

- [pnpm](https://pnpm.io/installation)
- [Docker](https://docs.docker.com/get-docker/)

2. Install dependencies:

```bash
pnpm install
```

3. Copy the example environment file and fill in the missing values:

```bash
cp .env.example .env
```

## Development

### Running the App

Start the required services (Postgres + MinIO) and the Next.js dev server:

```bash
docker compose up -d
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Seeding Test Data

```bash
pnpm seed
```

This creates a user with a selfie, avatar, and a full set of wearables with pre-generated WOA images.

### Code Checks

```bash
pnpm typecheck          # TypeScript type checking
pnpm test               # All tests (browser + server)
pnpm test:browser       # Browser tests only
pnpm test:server        # Server tests only
pnpm lint               # ESLint
pnpm build              # Production build
```

## Environment Variables

All environment variables are sourced from `.env` (see `.env.example` for the template).
Server-side variables (without `NEXT_PUBLIC_` prefix) are only available in route handlers and server code.
Client-side variables (with `NEXT_PUBLIC_` prefix) are bundled at build time and available in the browser.

### Blob Storage (MinIO / R2)

For local development, we use [MinIO](https://min.io/) as an S3-compatible object storage.
In production, Cloudflare R2 is used. The S3 client auto-negotiates between them via the endpoint URL.

## Additional Development Tasks

### Inspecting the Database

```sh
psql postgresql://dressme:dressme@localhost:5432/local
```

### Dropping the Database

```bash
docker compose down -v
```

### Getting an Access Token

When making API requests directly, pass a valid access token:

```bash
curl -X GET 'http://localhost:3000/api/wearables' \
    --header 'Authorization: Bearer $YOUR_ACCESS_TOKEN'
```

### Evals

Evals measure the performance of AI components. To run the classification eval:

```bash
pnpm evals
EVAL_REPEATS=2 pnpm evals                 # 2 extra runs per case (3 total)
pnpm evals -- --maxConcurrency=10         # override concurrency (default is 20)
```

## Deployment

The app is automatically deployed to Vercel on every push.

To deploy manually:

```bash
pnpm deploy
```
