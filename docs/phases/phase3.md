# 📄 Phase 3 — Finance Module (Transaction System + Idempotency)

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Build the **core financial transaction system**, which is the **most critical and sensitive component** of the entire platform.

This phase must ensure:

* Correctness (no duplicate or inconsistent transactions)
* Idempotency (safe retries)
* Strong validation
* High performance under heavy write load
* Clean event emission for downstream systems

---

# 🧠 Scope of Phase 3

### You MUST implement:

* Transaction data model
* CRUD APIs for financial records
* Idempotency mechanism (MANDATORY)
* Validation layer
* Filtering & pagination
* Integration with RBAC (Phase 1)
* Integration with User module (Phase 2)

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT allow duplicate transactions

* ❌ DO NOT skip idempotency

* ❌ DO NOT trust client input blindly

* ❌ DO NOT expose internal DB structure

* ✅ MUST enforce RBAC rules

* ✅ MUST validate all inputs strictly

* ✅ MUST design for high write throughput

* ✅ MUST emit events (for Phase 4)

---

# 🏗️ Expected Folder Structure

```plaintext id="p3struct"
/src
  /modules
    /finance
      finance.controller.js
      finance.service.js
      finance.repository.js
      finance.routes.js
      finance.types.js
      finance.validator.js
  /shared
    /db
    /middleware
    /utils
```

---

# 🗄️ Data Model

## Transactions Table

```plaintext id="p3schema"
transactions
------------
id (uuid, primary key)
user_id (uuid, indexed)
amount (decimal)
type (enum: income | expense)
category (string)
note (string, optional)
timestamp (datetime)
idempotency_key (string, unique)
created_at
updated_at
```

---

# 🔥 CRITICAL: Idempotency System

## Purpose:

Prevent duplicate transactions due to:

* Network retries
* Client retries
* System failures

---

## Implementation Requirements:

### Input:

```json id="p3ideminput"
{
  "idempotency_key": "unique_key_123"
}
```

---

### Logic:

```plaintext id="p3idemflow"
1. Check if idempotency_key exists
2. IF exists → return existing transaction
3. ELSE → process transaction
4. Store idempotency_key with transaction
```

---

### DB Constraint:

* UNIQUE index on `idempotency_key`

---

### ⚠️ MUST:

* Idempotency check must be **atomic**
* Use DB transaction if needed

---

# 🔐 Functional Requirements

## 1. Create Transaction

### Endpoint:

```http id="p3create"
POST /transactions
```

---

### Access:

* Admin
* Analyst
* (Viewer ❌)

---

### Input:

```json id="p3createinput"
{
  "amount": 1000,
  "type": "income",
  "category": "salary",
  "note": "monthly salary",
  "idempotency_key": "txn_123"
}
```

---

### Validation:

* amount > 0
* type ∈ (income, expense)
* category not empty

---

### Output:

```json id="p3createoutput"
{
  "id": "txn_id",
  "status": "created"
}
```

---

---

## 2. Get Transactions (Filtered)

### Endpoint:

```http id="p3get"
GET /transactions?type=income&category=salary&page=1&limit=10
```

---

### Requirements:

* Pagination REQUIRED
* Filter by:

  * type
  * category
  * date range

---

---

## 3. Update Transaction

### Endpoint:

```http id="p3update"
PUT /transactions/:id
```

---

### Access:

* Admin ONLY

---

### Rules:

* Cannot change `idempotency_key`
* Must validate updated data

---

---

## 4. Delete Transaction

### Endpoint:

```http id="p3delete"
DELETE /transactions/:id
```

---

### Access:

* Admin ONLY

---

### Behavior:

* Prefer soft delete (optional)

---

# 🔐 RBAC Enforcement

| Action             | Admin | Analyst | Viewer       |
| ------------------ | ----- | ------- | ------------ |
| Create Transaction | ✅     | ✅       | ❌            |
| View Transactions  | ✅     | ✅       | ✅ (own only) |
| Update Transaction | ✅     | ❌       | ❌            |
| Delete Transaction | ✅     | ❌       | ❌            |

---

# 🔄 Integration Requirements

## With Auth (Phase 1)

* Extract `user_id` from JWT
* Enforce role permissions

---

## With User Module (Phase 2)

* Validate user exists
* Ensure user is active

---

# ⚡ Validation Layer

Agent MUST implement:

* Schema validation (Zod/Joi/etc.)
* Business validation:

  * No negative amounts
  * Valid categories
  * Valid type

---

# ⚡ Performance Requirements

* Write API: <150ms
* Read API: <100ms
* Indexed queries mandatory

---

# 📊 Query Optimization

## Indexes REQUIRED:

```plaintext id="p3indexes"
user_id
timestamp
type
category
idempotency_key (unique)
```

---

# 🧪 Edge Cases to Handle

* Duplicate idempotency_key
* Invalid input
* Unauthorized access
* Non-existent transaction
* High-frequency retries

---

# 🧨 Failure Handling

## Duplicate Request:

* Return existing transaction (200 OK)

---

## DB Conflict:

* Handle gracefully (retry or return existing)

---

## Invalid Input:

* 400 Bad Request

---

## Unauthorized:

* 403 Forbidden

---

# 🔄 Event Emission (PREP FOR PHASE 4)

## MUST Emit Event:

```plaintext id="p3event"
TransactionCreated
```

---

### Payload:

```json id="p3eventpayload"
{
  "transaction_id": "id",
  "user_id": "user_id",
  "amount": 1000,
  "type": "income"
}
```

---

### Note:

* Use placeholder event bus (to be built in Phase 4)

---

# 🧾 Expected APIs Summary

| Method | Endpoint          | Description              |
| ------ | ----------------- | ------------------------ |
| POST   | /transactions     | Create transaction       |
| GET    | /transactions     | List/filter transactions |
| PUT    | /transactions/:id | Update transaction       |
| DELETE | /transactions/:id | Delete transaction       |

---

# 🧩 Internal Interfaces

## Finance Service

```plaintext id="p3service"
createTransaction(data, user_id)
getTransactions(filters)
updateTransaction(id, data)
deleteTransaction(id)
```

---

## Repository Layer

```plaintext id="p3repo"
create(txn)
findById(id)
findByIdempotencyKey(key)
update(txn)
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* Idempotency logic
* Validation rules

---

### Integration Tests:

* Create transaction (normal + duplicate)
* RBAC enforcement
* Filtering + pagination

---

# 📌 Deliverables

* Fully functional transaction system
* Idempotency implemented correctly
* RBAC enforced
* Validation layer implemented
* Event emission integrated

---

# 🚫 Common Mistakes to Avoid

* Skipping idempotency ❌
* Allowing duplicate transactions ❌
* No indexing ❌
* No pagination ❌
* Trusting client input ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Transactions are created without duplication
* Duplicate requests return same result
* RBAC is enforced correctly
* APIs are performant and validated
* Event emission works

---

# 🧠 Final Note for Agent

This is the **heart of the system**.

If this fails:

* Financial data becomes unreliable
* Trust is broken
* System becomes unusable

Design with **extreme caution and precision**.

---
