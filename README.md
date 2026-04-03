# Finance Backend (Assignment Version)

Simple modular monolith for evaluation.

## Run

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Start PostgreSQL (for local DB-backed run):

```bash
docker-compose up postgres -d
```

4. Run migrations:

```bash
bash scripts/migrate.sh
```

5. Start the app:

```bash
npm run dev
```

Server runs on `http://localhost:3000`.

## Final Structure

```text
/src
+-- config
+-- db
+-- modules
¦   +-- auth
¦   +-- user
¦   +-- finance
¦   +-- analytics
+-- middleware
+-- utils
+-- types
+-- app.ts
+-- server.ts
```

## Included Features

- Auth (JWT): register, login, me
- User CRUD
- Finance transactions with idempotency (`idempotency_key`)
- Basic analytics from direct DB queries (summary, trends)

## Removed Complexity

- Event bus and async event flows
- Consumers and jobs
- Retry handlers and reconciliation schedulers
- Finance write microservice runtime path

## API Routes

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `PUT /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `POST /api/v1/transactions`
- `GET /api/v1/transactions`
- `PUT /api/v1/transactions/:id`
- `DELETE /api/v1/transactions/:id`
- `GET /api/v1/analytics/summary`
- `GET /api/v1/analytics/trends`
