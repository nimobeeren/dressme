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

All environment variables are sourced from `.env` (see `.env.example` for the template).
Server-side variables (without `NEXT_PUBLIC_` prefix) are only available in route handlers and server code.

### Blob Storage (MinIO / R2)

For local development, we use [MinIO](https://min.io/) as an S3-compatible object storage.
In production, Cloudflare R2 is used. The S3 client auto-negotiates between them via the endpoint URL.

You can access the MinIO console at `http://localhost:9101` with the credentials `minioadmin/minioadmin`.

## Additional Development Tasks

### Inspecting the Database

```sh
psql postgresql://dressme:dressme@localhost:5432/local
```

### Dropping the Database

```bash
docker compose down -v
```

### Authentication

Authentication uses Auth0 with encrypted, httpOnly session cookies via [`@auth0/nextjs-auth0`](https://github.com/auth0/nextjs-auth0) (the app must be a Regular Web Application in the Auth0 dashboard). Login, callback and logout routes are mounted at `/auth/login`, `/auth/callback` and `/auth/logout`.

Pages and server actions read the session through the auth layer in `src/server/auth.ts`. The outfit preview image is served by `GET /api/images/outfit`, which authenticates via the same session cookie (sent automatically by the browser).

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
