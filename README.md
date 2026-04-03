# Backend Assignment

Clean, assignment-level modular monolith.

## Root Structure

```text
/backend-assignment
	/src
	/prisma
		schema.prisma
		/migrations
	/tests
		auth.test.ts
		user.test.ts
		finance.test.ts
		analytics.test.ts
	package.json
	tsconfig.json
	.env
	.env.example
	README.md
```

## Run

1. Install dependencies:

```bash
npm install
```

2. Copy env template and set values if needed:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

Server default: `http://localhost:3000`.

## Run With Docker

1. Build and start services:

```bash
npm run docker:up
```

2. View logs:

```bash
npm run docker:logs
```

3. Stop containers:

```bash
npm run docker:down
```

Notes:

- API is available at `http://localhost:3000`.
- Postgres is available at `localhost:5432`.
- Redis is available at `localhost:6379`.
- SQL files in `prisma/migrations` are mounted into Postgres init and run on first database initialization.

## Caching

- Redis-backed caching is applied to read-heavy endpoints only:
  - `GET /auth/me`
  - `GET /users/:id`
  - `GET /users`
  - `GET /finance/transactions`
  - `GET /analytics/summary`
  - `GET /analytics/trends`
- Mutating endpoints are not cached.
- Finance write operations invalidate finance-list and analytics cache versions.
- User updates and deactivation invalidate user and auth-me cache entries.

To disable Redis caching locally, set `REDIS_ENABLED=false`.

## Scope

- Auth with JWT
- User CRUD
- Finance transactions with idempotency
- Basic analytics queries
- Selective Redis caching for read endpoints

`/src` remains the application source of truth and was not modified for this root-level cleanup.
