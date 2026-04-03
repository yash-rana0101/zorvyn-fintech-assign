# Finance Backend

Finance Data Processing & Access Control System with a single API service and modular folders.

---

## Architecture

Single-service modular backend

```
Client → API
          ├── Auth Module
          ├── User Module
          ├── Finance Module
          └── Analytics Module
          ↓
        PostgreSQL + Redis
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- npm >= 9

### 1. Clone & Install

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start Infrastructure

```bash
docker-compose up postgres redis -d
```

### 4. Run Migrations

```bash
bash scripts/migrate.sh
```

### 5. Seed Database

```bash
bash scripts/seed.sh
```

### 6. Start API

```bash
npm run dev
```

API available at: `http://localhost:3000`

---

## Project Structure

```
/apps
  /api              # Main API service
/packages
  /database         # DB connection & migrations
  /cache            # Redis client & helpers
  /event-bus        # Event abstraction for async processing
  /logger           # Winston logging
  /monitoring       # Metrics & health checks
  /security         # JWT, password hashing, tokens
  /utils            # Shared utilities
/infra
  /docker           # Dockerfiles
  /postgres         # DB schema
  /redis            # Redis config
  /nginx            # Load balancer config
/scripts            # Shell scripts
/tests              # Unit & integration tests
```

---

## 🔐 API Endpoints (Phase 1)

| Method | Endpoint       | Auth Required | Description           |
| ------ | -------------- | ------------- | --------------------- |
| POST   | /auth/register | No            | Register a new user   |
| POST   | /auth/login    | No            | Login, receive JWT    |
| POST   | /auth/refresh  | No            | Rotate refresh token  |
| POST   | /auth/logout   | Yes           | Revoke active session |
| GET    | /auth/me       | Yes           | Get current user info |
| GET    | /health        | No            | Health check          |

---

## 👤 Roles

| Role    | Permissions             |
| ------- | ----------------------- |
| viewer  | Read-only access        |
| analyst | Read + analytics access |
| admin   | Full access             |

---

## 🧪 Testing

```bash
npm test
```

## Operations

- Multi-region Nginx template: `infra/nginx/nginx.multi-region.conf`
- Edge WAF rules: `infra/nginx/waf.rules.conf`
- Reconciliation run (manual): `npm run reconcile`
- Shard rebalancing helper: `npm run rebalance-shard -- <user_id> <shard_id> [reason]`
- DR failover helper: `bash scripts/dr-failover.sh <failed_region> <target_region>`
- Backup + restore: `bash scripts/backup.sh` and `bash scripts/restore.sh <backup_file.sql.gz>`
- CI/CD pipeline: `.github/workflows/phase10-ci-cd.yml`

DR runbook: `docs/runbooks/disaster-recovery.md`

---

## Observability

### Runtime Endpoints

- API health: `GET /health`
- API metrics: `GET /metrics`

API responses return `x-request-id` and `x-trace-id` headers for request correlation.

### Run Prometheus + Grafana

```bash
docker-compose --profile observability up -d prometheus grafana
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (default login: `admin` / `admin`)

The starter dashboard is auto-provisioned from:

- `infra/grafana/dashboards/finance-observability.json`

---

## 📄 Documentation

See [`docs/PRD.md`](docs/PRD.md) for full product requirements.
See [`docs/phases/`](docs/phases/) for phase-by-phase implementation guides.
