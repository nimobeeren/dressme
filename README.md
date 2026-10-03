# dressme

A virtual wardrobe that shows you how clothes look on you.

## Demo

[!Demo video](https://github.com/user-attachments/assets/0fa75362-c705-416c-bdb5-738ddb5e8c99)

## Tech Stack

- shadcn/ui
- Tailwind
- React
- Clerk
- Drizzle
- PostgreSQL
- Neon
- Vercel
- Replicate
- Google Gemini

## Installation

1. Install the required tooling:

- [pnpm 11](https://pnpm.io/installation)
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

### Running Migrations

To ensure the database schema is up to date, run the migrations:

```bash
pnpm db:migrate
```

### Seeding Test Data

Insert some test data into the database:

```bash
pnpm db:seed
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

All environment variables are sourced from `.env` (see `.env.example` for the template). [t3-env](https://env.t3.gg) validates them at build time and on startup.

Server-only variables are declared in `src/env/server.ts` and are never shipped to the browser. Variables the browser needs are declared in `src/env/client.ts` under a `NEXT_PUBLIC_` prefix, which Next.js substitutes with the build-time value: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (read by the Clerk SDK) and `NEXT_PUBLIC_MAX_UPLOAD_SIZE`, which defaults to 4 MB.

### Blob Storage (MinIO / R2)

For local development, we use [MinIO](https://min.io/) as an S3-compatible object storage.
In production, Cloudflare R2 is used. The S3 client auto-negotiates between them via the endpoint URL.

You can access the MinIO console at `http://localhost:9101` with the credentials `minioadmin/minioadmin`.

## Additional Development Tasks

### Deleting Orphaned Images

Images that are no longer referenced by the database (for example after re-running the seed script or regenerating an avatar) can be removed from the blob storage buckets:

```sh
pnpm delete-orphaned-images             # dry run: lists orphaned images
pnpm delete-orphaned-images -- --delete # actually deletes them
```

### Inspecting the Database

```sh
psql postgresql://dressme:dressme@localhost:5432/local
```

### Dropping the Database

```bash
docker compose down -v
```

### Logging

Server code logs through [pino](https://getpino.io) in `src/server/logger.ts`:

```ts
import { logger } from "@/server/logger";

logger.info({ topId, bottomId }, "Serving outfit image");
```

When `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is set (see `.env.example`), `pino-opentelemetry-transport` exports records to [PostHog](https://posthog.com) over OTLP. When it is unset, records are written to stdout. Logs appear in the PostHog **Logs** page, filterable by `service.name` (`dressme`), severity, or any field you attach.

Every record also carries resource attributes: `deployment.environment` is `production` / `preview` / `development` on Vercel (`VERCEL_ENV`) and `local` everywhere else, and `service.commit` is the deployed commit when `VERCEL_GIT_COMMIT_SHA` is present. Filter on `deployment.environment` to tell environments apart.

`logger` runs on the Node.js server only, so browser code must not import it.

### Evals

Evals measure the performance of AI components. To run them:

```bash
pnpm evals
EVAL_REPEATS=2 pnpm evals                 # 2 extra runs per case (3 total)
pnpm evals -- --maxConcurrency=10         # override concurrency (default is 20)
```

Evals are defined in `evals/` and use a `.eval.ts` extension.

## Deployment

Deploy the app by pushing to a branch. The `main` branch is deployed to production and other branches are deployed to preview environments.

In rare situations, you may want to deploy manually:

```bash
pnpm deploy
```
