# API

## Installation

```bash
poetry install
```

## Development

### Seeding the database

The first time you run this, you need to create the database and insert some test data:

```bash
poetry run python -m wardrobe.seed
```

This will create a file named `wardrobe.db` containing some test data.

### Starting the server

Start a HTTP server for development:

```bash
poetry run fastapi dev main.py
```
