# 📄 Phase 5 — Analytics Module (Aggregations + Dashboard APIs)

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Build a **high-performance Analytics Module** that provides **fast dashboard insights** using **precomputed aggregates** instead of expensive real-time queries.

This phase must ensure:

* Sub-50ms read latency (via caching)
* Event-driven updates (via Phase 4 Event Bus)
* Accurate financial summaries
* Scalable read patterns

---

# 🧠 Scope of Phase 5

### You MUST implement:

* Aggregation logic (income, expense, balance)
* Event-driven updates from Finance module
* Redis-based caching for dashboard data
* Dashboard APIs (summary + trends)
* Basic time-based aggregations

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT compute aggregates on every request

* ❌ DO NOT query full transaction table for dashboard

* ❌ DO NOT tightly couple with Finance DB queries

* ✅ MUST use event-driven updates

* ✅ MUST cache results in Redis

* ✅ MUST design for near real-time updates

* ✅ MUST keep reads extremely fast (<50ms)

---

# 🏗️ Expected Folder Structure

```plaintext id="p5struct"
/src
  /modules
    /analytics
      analytics.controller.js
      analytics.service.js
      analytics.repository.js
      analytics.consumer.js
      analytics.types.js
  /shared
    /cache
    /event-bus
```

---

# 🔥 Core Concept

## Event-Driven Aggregation

```plaintext id="p5flow"
TransactionCreated Event
 ↓
Analytics Consumer
 ↓
Update Aggregates
 ↓
Store in Redis
 ↓
Serve via API
```

---

# 🗄️ Data Strategy

## 1. Primary Storage

👉 Redis (for fast reads)

---

## 2. Optional (Future)

* Analytics DB (ClickHouse / BigQuery)

---

# 🔐 Functional Requirements

## 1. Aggregation Logic

For each user:

### Maintain:

```plaintext id="p5agg"
total_income
total_expense
net_balance
```

---

### Formula:

```plaintext id="p5formula"
net_balance = total_income - total_expense
```

---

---

## 2. Event Consumption

### Listen to:

```plaintext id="p5event"
TransactionCreated
```

---

### Logic:

```plaintext id="p5eventflow"
IF type = income → increase total_income
IF type = expense → increase total_expense
Recalculate net_balance
Update cache
```

---

---

## 3. Redis Storage Structure

```plaintext id="p5redis"
analytics:{user_id} → {
  total_income,
  total_expense,
  net_balance
}
```

---

### TTL:

```plaintext id="p5ttl"
10–30 seconds (refresh via events)
```

---

---

## 4. Dashboard Summary API

### Endpoint:

```http id="p5summary"
GET /analytics/summary
```

---

### Access:

* Admin
* Analyst
* Viewer (own data only)

---

### Output:

```json id="p5summaryoutput"
{
  "total_income": 50000,
  "total_expense": 20000,
  "net_balance": 30000
}
```

---

---

## 5. Category-wise Aggregation

### Maintain:

```plaintext id="p5category"
category_totals: {
  "food": 5000,
  "salary": 30000
}
```

---

### Update via events

---

---

## 6. Trends API (Basic)

### Endpoint:

```http id="p5trends"
GET /analytics/trends?period=monthly
```

---

### Output Example:

```json id="p5trendsoutput"
[
  { "month": "Jan", "income": 10000, "expense": 5000 },
  { "month": "Feb", "income": 20000, "expense": 8000 }
]
```

---

# 🔄 Integration Requirements

## With Finance Module (Phase 3)

* Consume `TransactionCreated` event

---

## With Event Bus (Phase 4)

* Subscribe using event bus interface

---

## With Auth (Phase 1)

* Extract user_id from JWT
* Enforce access control

---

# ⚡ Performance Requirements

| API         | Target   |
| ----------- | -------- |
| Summary API | < 50 ms  |
| Trends API  | < 100 ms |

---

# ⚡ Optimization Strategy

* Cache-first reads (Redis)
* Avoid DB queries for dashboard
* Incremental updates via events

---

# 🧪 Edge Cases to Handle

* Missing cache → fallback compute (optional)
* Rapid transaction bursts
* Concurrent updates
* Inconsistent data recovery

---

# 🧨 Failure Handling

## Redis Down:

* Fallback to DB (optional)
* Log warning

---

## Event Missed:

* Data inconsistency possible
* Future fix via Kafka replay

---

## Invalid Data:

* Ignore event
* Log error

---

# ⚠️ Concurrency Handling

* Ensure atomic updates in Redis
* Avoid race conditions

---

# 🧾 Expected APIs Summary

| Method | Endpoint           | Description            |
| ------ | ------------------ | ---------------------- |
| GET    | /analytics/summary | User financial summary |
| GET    | /analytics/trends  | Trends over time       |

---

# 🧩 Internal Interfaces

## Analytics Service

```plaintext id="p5service"
updateAggregates(event)
getSummary(user_id)
getTrends(user_id, period)
```

---

## Event Consumer

```plaintext id="p5consumer"
subscribe("TransactionCreated", handler)
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* Aggregation logic
* Event processing

---

### Integration Tests:

* Transaction → Event → Analytics update
* API response validation

---

# 📌 Deliverables

* Working analytics module
* Event-driven aggregation system
* Redis caching implemented
* Dashboard APIs functional
* Fast response times achieved

---

# 🚫 Common Mistakes to Avoid

* Querying DB on every request ❌
* No caching ❌
* Blocking event processing ❌
* Ignoring concurrency ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Dashboard APIs return correct data
* Aggregates update via events
* Redis caching works properly
* APIs meet latency targets

---

# 🧠 Final Note for Agent

This module defines **user experience speed**.

If done right:
👉 Dashboard feels instant

If done wrong:
👉 System becomes slow and expensive

Design for:

* Speed ⚡
* Efficiency 💰
* Scalability 🚀

---
