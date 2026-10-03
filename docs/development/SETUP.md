# Setup

This document describes how to prepare a local development environment for Ananya.

## Prerequisites

Install the following software before continuing:

- Node.js `22.14.0` (or any version satisfying `>=22.12.0`, see `.nvmrc`)
- pnpm `9.0.0`
- Docker and Docker Compose
- Git

## Clone the Repository

```bash
git clone <repository-url>
cd ananya
```

## Install Dependencies

```bash
pnpm install
```

## Configure Environment Variables

Create a local environment file.

```bash
cp .env.example .env
```

Update any required values before starting the applications.

## Start Supporting Services

Start the local infrastructure defined by the repository.

```bash
docker compose up -d
```

## Verify the Repository

Run the required quality checks.

```bash
pnpm check-types
pnpm lint
pnpm build
```

All commands should complete successfully before beginning development.

## Next

Continue with:

- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
