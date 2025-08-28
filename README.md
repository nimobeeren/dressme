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
- Cloudflare Workers
- Azure Container Apps
- Replicate

## Repository Structure

This repo contains three primary components:

- 📁 [`api`](./api): the backend API
- 📁 [`client`](./client): the frontend client
- 📁 [`terraform`](./terraform): the infrastructure configuration for the API

<!-- TODO: move the API into the client directory -->
<!-- TODO: remove terraform -->

Each component has its own README with more specific information.

Next to that, there are some secondary directories:

- 📁 [`.github`](./.github): GitHub Actions CI configuration
- 📁 [`images`](./images): some sample images useful for seeding the development database
