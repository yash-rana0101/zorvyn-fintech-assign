# 📄 Phase 1 — Authentication & RBAC System

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Build a **secure, scalable Authentication & Role-Based Access Control (RBAC) system** that will act as the **gatekeeper** for all future modules.

This phase must ensure:

* Stateless authentication (JWT-based)
* Role-based authorization (Viewer, Analyst, Admin)
* Redis-backed caching for performance
* Clean modular design (extractable later)

---

# 🧠 Scope of Phase 1

### You MUST implement:

* JWT Authentication system
* User login flow (mock or DB-based)
* Role-based access control (RBAC)
* Middleware for route protection
* Redis caching for roles/permissions

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT implement full user module (only minimal user for auth)

* ❌ DO NOT tightly couple auth logic with other modules

* ❌ DO NOT store sessions in memory

* ❌ DO NOT call DB on every request for auth

* ✅ MUST keep system stateless

* ✅ MUST design for horizontal scaling

* ✅ MUST keep logic modular and extractable

---

# 🏗️ Expected Folder Structure

```plaintext
/src
  /modules
    /auth
      auth.controller.js
      auth.service.js
      auth.middleware.js
      auth.routes.js
      auth.types.js
  /shared
    /middleware
    /utils
    /cache
    /db
```

---

# 🔐 Functional Requirements

## 1. Authentication Flow

### Endpoint:

```http
POST /auth/login
```

### Input:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

### Output:

```json
{
  "access_token": "JWT_TOKEN"
}
```

---

### Logic:

1. Validate credentials (mock or DB)
2. Fetch user role
3. Generate JWT token
4. Return token

---

## 2. JWT Token Structure

### Payload:

```json
{
  "user_id": "uuid",
  "role": "admin | analyst | viewer",
  "iat": "...",
  "exp": "..."
}
```

---

### Requirements:

* Use secure secret
* Expiry: 1 hour
* Stateless verification (no DB lookup)

---

## 3. Roles Definition

| Role    | Permissions      |
| ------- | ---------------- |
| Viewer  | Read only        |
| Analyst | Read + analytics |
| Admin   | Full access      |

---

## 4. Authorization Middleware

### Purpose:

Protect routes based on roles

---

### Example Usage:

```js
authorize(["admin"])
authorize(["admin", "analyst"])
```

---

### Middleware Flow:

```plaintext
Request
 ↓
Extract JWT
 ↓
Validate token
 ↓
Extract role
 ↓
Check permission
 ↓
Allow / Reject
```

---

## 5. Redis Integration (MANDATORY)

### Purpose:

Avoid DB calls for role validation

---

### Key Structure:

```plaintext
user:{user_id}:role → "admin"
```

---

### TTL:

```plaintext
5–10 minutes
```

---

### Flow:

```plaintext
Request
 ↓
Check Redis
 ↓
If hit → use role
If miss → fetch from DB → cache
```

---

# ⚡ Non-Functional Requirements

## Performance

* Auth middleware must add <10ms latency
* No DB call on every request

---

## Scalability

* Stateless design
* Works across multiple instances

---

## Security

* JWT must be signed securely
* Reject invalid/expired tokens
* No sensitive data in token

---

# 🧪 Edge Cases to Handle

* Invalid token
* Expired token
* Missing token
* Unauthorized role access
* Redis unavailable (fallback to DB)

---

# 🧨 Failure Handling

## Redis Down:

* Fallback to DB
* Log warning

---

## Invalid JWT:

* Return 401 Unauthorized

---

## Permission Denied:

* Return 403 Forbidden

---

# 🧾 Expected APIs Summary

| Method | Endpoint    | Description        |
| ------ | ----------- | ------------------ |
| POST   | /auth/login | Generate JWT token |

---

# 🧩 Internal Interfaces

## Auth Service

```plaintext
generateToken(user)
verifyToken(token)
```

---

## RBAC Middleware

```plaintext
authorize(allowedRoles)
```

---

# 🧪 Testing Requirements

Agent MUST include:

* Unit tests for:

  * Token generation
  * Token validation
  * Role checks

* Integration tests for:

  * Login flow
  * Protected route access

---

# 📌 Deliverables

Agent must produce:

* Working authentication system
* JWT-based middleware
* RBAC enforcement
* Redis caching implemented
* Clean modular structure

---

# 🚫 Common Mistakes to Avoid

* Storing sessions in memory ❌
* DB call on every request ❌
* Hardcoding roles ❌
* Mixing auth logic with business logic ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* User can login and receive JWT
* Protected routes enforce roles correctly
* Redis caching works for role lookup
* System remains stateless and scalable

---

# 🧠 Final Note for Agent

This phase is **foundation-critical**.

Poor implementation here will:

* Break scalability
* Increase latency
* Cause security issues

Design it like it will serve **millions of users**, not just a demo.

---
