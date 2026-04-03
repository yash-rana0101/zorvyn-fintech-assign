# 📄 Phase 8 — Finance Write Service Extraction (Microservice Transition)

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Extract the **Finance Write Path** from the modular monolith into an **independent microservice** to handle:

* High write throughput (300K+ writes/sec target)
* Independent scaling
* Isolation of critical financial operations
* Improved system resilience

This is the **first step toward controlled microservices architecture**.

---

# 🧠 Scope of Phase 8

### You MUST implement:

* Separate Finance Write Service
* API for transaction creation (write-only)
* Independent DB access layer
* Communication between monolith and service
* Kafka integration for events
* Idempotency preservation

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT break existing system functionality

* ❌ DO NOT duplicate business logic incorrectly

* ❌ DO NOT remove idempotency guarantees

* ❌ DO NOT tightly couple services

* ✅ MUST keep service independent

* ✅ MUST maintain data consistency

* ✅ MUST ensure backward compatibility

* ✅ MUST design for horizontal scaling

---

# 🏗️ Architecture Change

## Before:

```plaintext id="p8before"
Monolith → Finance Module → DB
```

---

## After:

```plaintext id="p8after"
Monolith → Finance Write Service → DB
                     ↓
                   Kafka
```

---

# 🏗️ Expected Folder Structure (New Service)

```plaintext id="p8struct"
/finance-write-service
  /src
    /controllers
    /services
    /repositories
    /routes
    /validators
    /kafka
    /db
```

---

# 🔥 Core Responsibilities

## Finance Write Service MUST handle:

* Create transaction
* Idempotency validation
* DB writes
* Event publishing (Kafka)

---

# 🔐 Functional Requirements

## 1. Create Transaction API

### Endpoint:

```http id="p8create"
POST /transactions
```

---

### Input:

```json id="p8input"
{
  "user_id": "uuid",
  "amount": 1000,
  "type": "income",
  "category": "salary",
  "note": "monthly",
  "idempotency_key": "txn_123"
}
```

---

### Output:

```json id="p8output"
{
  "transaction_id": "uuid",
  "status": "created"
}
```

---

---

## 2. Idempotency (MANDATORY)

### Logic:

```plaintext id="p8idem"
Check idempotency_key
IF exists → return existing txn
ELSE → create new txn
```

---

### MUST:

* Use DB-level unique constraint
* Ensure atomic operation

---

---

## 3. Event Publishing

### After successful write:

```plaintext id="p8event"
Publish TransactionCreated to Kafka
```

---

---

# 🔄 Communication with Monolith

## Option 1 (Preferred): HTTP API

```plaintext id="p8comm"
Monolith → REST API → Finance Service
```

---

## Option 2 (Future):

* gRPC

---

### Requirements:

* Timeout handling
* Retry logic
* Circuit breaker

---

# ⚡ Scaling Strategy

## Horizontal Scaling:

```plaintext id="p8scaling"
Multiple instances of Finance Service
 ↓
Load Balancer
```

---

## DB Scaling:

* Sharding by `user_id`

---

# 🗄️ Database Strategy

## Separate DB (Recommended)

```plaintext id="p8db"
finance_db (isolated)
```

---

### Why:

* Independent scaling
* Fault isolation

---

# ⚠️ Data Consistency

* Strong consistency for writes
* Eventual consistency for analytics

---

# 🧪 Edge Cases to Handle

* Duplicate idempotency key
* Network timeout between services
* Partial failure (write success, event fail)

---

# 🧨 Failure Handling

## Service Down:

* Retry from monolith
* Circuit breaker

---

## DB Conflict:

* Return existing transaction

---

## Kafka Failure:

* Retry publish
* Log error

---

# ⚠️ Concurrency Handling

* Atomic DB operations
* Avoid race conditions in idempotency

---

# 🧾 Expected APIs Summary

| Method | Endpoint      | Description        |
| ------ | ------------- | ------------------ |
| POST   | /transactions | Create transaction |

---

# 🧩 Internal Interfaces

## Finance Service

```plaintext id="p8service"
createTransaction(data)
```

---

## Repository

```plaintext id="p8repo"
findByIdempotencyKey(key)
create(txn)
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* Idempotency logic
* Validation

---

### Integration Tests:

* Monolith → Service communication
* Kafka event emission
* Failure scenarios

---

# 📌 Deliverables

* Separate Finance Write Service
* API working independently
* Idempotency preserved
* Kafka integration working
* Monolith successfully calling service

---

# 🚫 Common Mistakes to Avoid

* Breaking idempotency ❌
* Tight coupling with monolith ❌
* No retry logic ❌
* No timeout handling ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Finance writes are handled by new service
* Monolith delegates write operations correctly
* System scales independently
* No duplicate transactions occur
* Events are published reliably

---

# 🧠 Final Note for Agent

This is the **first real microservice extraction**.

If done right:
👉 System becomes scalable and modular

If done wrong:
👉 You create distributed system chaos

Focus on:

* Isolation 🧩
* Reliability 🛡️
* Scalability 🚀

---
