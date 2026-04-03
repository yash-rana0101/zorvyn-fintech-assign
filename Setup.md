# Setup Guide

This file is a dedicated setup reference for running the Zorvyn Finance Backend in development.

## Prerequisites

- Node.js 18+
- npm 9+
- Docker + Docker Compose (recommended)

Optional (only for manual local mode):

- PostgreSQL
- Redis

## 1) Install Dependencies

```bash
npm install
```

## 2) Configure Environment

Create `.env` from `.env.example`.

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Minimum required values:

- `JWT_SECRET` (must be at least 16 characters)
- Database settings (`DATABASE_URL` or `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`)

## 3) Choose a Run Mode

### Option A: Docker Compose (Recommended)

Start full stack (API + PostgreSQL + Redis):

```bash
npm run docker:up
```

View logs:

```bash
npm run docker:logs
```

Stop stack:

```bash
npm run docker:down
```

Service endpoints:

- API: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

Health check:

```bash
curl http://localhost:3000/health
```

Seed demo data (run on host machine):

```bash
npm run seed
```

Notes:

- The database migrations in `prisma/migrations` are mounted into Postgres init scripts and run on first DB initialization.
- Seeding is idempotent and safe to rerun.

### Option B: Local Runtime (Without Docker)

Start PostgreSQL and Redis yourself, then run:

```bash
npm run dev
```

Seed data:

```bash
npm run seed
```

Health check:

```bash
curl http://localhost:3000/health
```

## 4) Verify Core API Paths

Base URL: `http://localhost:3000/api/v1`

Quick checks:

- `GET /health`
- `GET /api/v1`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

Swagger verification:

- `GET /docs`
- `GET /openapi.json`
- `GET /openapi.yaml`

---

## 4b) Export Shareable OpenAPI Files

```bash
npm run openapi:export
```

Outputs:

- `docs/openapi.json`
- `docs/openapi.yaml`

## 5) Common Configuration Toggles

- `REDIS_ENABLED=true|false`
  - Set to `false` to disable caching locally.
- `CORS_ALLOWED_ORIGINS`
  - Comma-separated list or `*`.
- `ENFORCE_HTTPS=true|false`
  - Keep `false` in local development.
- `RATE_LIMIT_*`
  - Tune global/auth/login limiter thresholds.

## 6) Troubleshooting

### App fails on startup with JWT error

- Ensure `.env` exists and `JWT_SECRET` is set with at least 16 characters.

### Database connection issues

- Confirm Postgres is running.
- Verify DB env values (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) or `DATABASE_URL`.
- If using Docker, verify `docker compose ps` shows healthy services.

### Redis warnings in logs

- The app is designed to continue without cache if Redis is unavailable.
- For local development without Redis, set `REDIS_ENABLED=false`.

### Port conflict on 3000

- Change `PORT` in `.env` and restart.

## 7) Useful Commands

| Command               | Purpose                     |
| --------------------- | --------------------------- |
| `npm run dev`         | Start API in watch mode     |
| `npm run start`       | Start API via tsx           |
| `npm run typecheck`   | Run TypeScript checks       |
| `npm run seed`        | Seed users and transactions |
| `npm run docker:up`   | Start Docker stack          |
| `npm run docker:logs` | Tail Docker logs            |
| `npm run docker:down` | Stop Docker stack           |

## 8) Next Reading

- `README.md` for architecture and API overview
- `docs/architecture.png` for system design
- `docs/api-flow.png` for request/flow mapping
- `docs/er-diagram.png` for data model
