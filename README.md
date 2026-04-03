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
- SQL files in `prisma/migrations` are mounted into Postgres init and run on first database initialization.

## Scope

- Auth with JWT
- User CRUD
- Finance transactions with idempotency
- Basic analytics queries

`/src` remains the application source of truth and was not modified for this root-level cleanup.
