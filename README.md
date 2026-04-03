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

## Scope

- Auth with JWT
- User CRUD
- Finance transactions with idempotency
- Basic analytics queries

`/src` remains the application source of truth and was not modified for this root-level cleanup.
