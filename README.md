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

4. Run idempotent seed data (safe to rerun):

```bash
npm run seed
```

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
- Docker uses a multi-stage build for the API image.
- SQL files in `prisma/migrations` are mounted into Postgres init and run on first database initialization.

## Key Features

| Feature                   | Implementation                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| JWT Authentication        | Stateless JWT tokens via `jsonwebtoken` with configurable `JWT_EXPIRES_IN`                 |
| Role-Based Access Control | Three-tier RBAC (`viewer`, `analyst`, `admin`) enforced with route middleware              |
| ACID-Compliant Financials | PostgreSQL `NUMERIC(15,2)` amounts with decimal-string handling in service layer           |
| DB-Level Aggregations     | `SUM` and `GROUP BY` performed in PostgreSQL for analytics endpoints                       |
| Redis Cache-Aside         | Analytics endpoints cached in Redis for 1 hour; invalidated by finance write events        |
| Soft Deletes              | Transaction delete uses `deleted_at` timestamp; records remain auditable                   |
| Zod Validation            | Zod schemas on auth/user/finance/analytics inbound payloads                                |
| Global Error Handling     | Centralized middleware with Zod and Prisma-aware formatting; no stack leaks in production  |
| Idempotent Seeding        | Upsert-based seed script (`npm run seed`) safe for repeated execution                      |
| Dockerized Stack          | Multi-stage `Dockerfile` + `docker-compose.yml` for API + Postgres + Redis                 |
| API Security Hardening    | Helmet headers, CORS allowlist, payload size limits, rate limits, optional HTTPS-only mode |

## Security Configuration

- CORS allowlist: `CORS_ALLOWED_ORIGINS` (comma-separated, `*` to allow all)
- Request body size limit: `API_BODY_LIMIT` (example: `100kb`, `1mb`)
- Reverse proxy trust toggle: `TRUST_PROXY`
- HTTPS-only enforcement toggle: `ENFORCE_HTTPS`
- Global rate limit window/max: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- Auth endpoint rate limit max: `AUTH_RATE_LIMIT_MAX`
- Login endpoint rate limit max: `LOGIN_RATE_LIMIT_MAX`

## Caching

- Redis-backed caching is applied to read-heavy endpoints only:
  - `GET /auth/me`
  - `GET /users/:id`
  - `GET /users`
  - `GET /transactions`
  - `GET /analytics/summary`
  - `GET /analytics/trends`
- Mutating endpoints are not cached.
- Analytics cache TTL is 1 hour.
- Finance write operations emit events that invalidate analytics cache versions.
- User updates and deactivation invalidate user and auth-me cache entries.

To disable Redis caching locally, set `REDIS_ENABLED=false`.

## Scope

- Auth with JWT
- User CRUD
- Finance transactions with idempotency
- Basic analytics queries
- Selective Redis caching for read endpoints
- Soft-deleted transactions are excluded from read/query paths

`/src` remains the application source of truth and was not modified for this root-level cleanup.
