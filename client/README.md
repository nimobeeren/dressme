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

### Generating API client

A TypeScript client is generated in `./src/api` to easily interact with the API. When the API is changed, you should re-generate this client to stay up-to-date:

```bash
pnpm run generate-client
```

Note that the API server must be running for this to work.
