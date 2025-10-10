# Contributing to Marlo

Thanks for your interest in contributing to Marlo! This guide will help you get set up for local development.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Database Development](#database-development)
- [Running the Application](#running-the-application)
- [Specific Development Areas](#specific-development-areas)
- [Making Changes](#making-changes)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) package manager
- [Docker](https://docs.docker.com/engine/install/) (recommended) OR PostgreSQL 16 + Redis installed locally

### Environment Variables

See the [Environment Configuration section in the README](README.md#environment-configuration) for a complete list of required environment variables for each service.

For local development, create a `.env` file in the project root with the required variables. You can also use a tool like [Doppler](https://doppler.com) to manage secrets if you're part of the core team.

## Development Setup

### Option 1: Docker (Recommended)

1. [Install Docker](https://docs.docker.com/engine/install/)
2. Run `docker-compose up -d` from the project root

This starts the infrastructure services (PostgreSQL, Redis, PgAdmin) for local development.

### Option 2: Manual Setup (macOS)

Install PostgreSQL and Redis with Homebrew:

```shell
brew install postgresql@16 redis
```

Start the services so they run in the background and on startup:

```shell
brew services start postgresql@16
brew services start redis
```

Create the database user:

First, login to `psql` with the `postgres` user:

```shell
psql postgres
```

Create the role (default user is `magicthing` with password `password`):

```sql
CREATE ROLE magicthing WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD 'password';
```

Exit with `\q` and confirm it's working:

```shell
psql -U magicthing -d postgres
```

### Installing Dependencies

```shell
pnpm install
```

## Database Development

The project uses Drizzle ORM with PostgreSQL 16 and Redis. Migrations are stored in `packages/core/src/drizzle/migrations/`.

### Creating Migrations

1. Make your required changes to the schema in `packages/core/src/drizzle/schema.ts`
2. Generate a new migration:

```shell
npx drizzle-kit generate
```

3. Run the migration:

```shell
npx drizzle-kit migrate
```

### Development Tip: Schema Push

In development, if you don't want to create `.sql` files while iterating on the schema, use:

```shell
npx drizzle-kit push
```

This pushes schema changes directly to the database without creating migration files.

### Data Migrations

For data migrations, generate a custom migration:

```shell
npx drizzle-kit generate --custom
```

Run it like a normal migration:

```shell
npx drizzle-kit migrate
```

### Resetting the Database

To reset and seed the database:

```shell
pnpm reset
```

Check `package.json` for other helpful database utilities.

## Running the Application

Start the development server:

```shell
pnpm dev
```

### Optional Development Tools

Run the type checker in watch mode:

```shell
pnpm dev:types
```

Run the webhook proxy (needed for testing webhooks locally):

```shell
pnpm dev:webhooks
```

## Specific Development Areas

### Developing the Google App

To test Google Gmail webhooks locally, run this in a separate terminal window. Messages will be forwarded to your local webhook:

```shell
pnpm run dev:webhooks:google
```

### Observing Mail Ingestion and Queues

A dashboard powered by BullBoard is available at:

- Development: `http://localhost:3000/dashboard`
- Production: `https://ingest.marlo.so/dashboard`

You can view the status of all queues, including the mail ingestion queue, and retry failed jobs.

**Local credentials:**

- Username: `admin`
- Password: `admin`

**Production credentials:** Set via environment variables `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD`

### Developing AI Apps

The AI apps code is in the `packages/ai` directory. The package contains scripts for generating test data, running apps, and comparing results.

Data is generated from your local database, so first login and seed your data.

#### Generate Test Data

Pull raw emails from your messages:

```shell
pnpm --filter @workspace/ai run test:generate:data
```

This saves emails in `packages/ai/testdata`.

#### Generate Reports

```shell
pnpm --filter @workspace/ai run test:generate:report
```

This saves a `report.md` file in each message directory.

#### Create Snapshot

Generate a snapshot of the current state:

```shell
pnpm --filter @workspace/ai run test:snapshot
```

This saves reasoning and answers for each message.

#### Compare Results

Compare app results to the current state:

```shell
pnpm --filter @workspace/ai run test:compare
```

If you like the results, rerun the snapshot command to update test data.

#### Running Against a Specific Message

For report, snapshot, and compare commands, specify a message:

```shell
pnpm --filter @workspace/ai run test:compare --appId <app-id> --messageId <message-id>
```

## Making Changes

1. **Create a branch** for your changes
2. **Make your changes** following the existing code style
3. **Test your changes** thoroughly
4. **Create a pull request** with a clear description of your changes

### Before Submitting

- Ensure the type checker passes: `pnpm dev:types`
- Test your changes locally
- Update documentation if you're changing functionality

## Getting Help

If you have questions or run into issues:

- Check existing issues and discussions
- Open a new issue with details about your problem
- Reach out to the maintainers

Thank you for contributing to Marlo! 🎉
