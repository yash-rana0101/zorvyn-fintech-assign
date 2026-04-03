# 📄 Phase 2 — User Module & Role Management

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Build a **User Management System** that integrates cleanly with Phase 1 (Auth + RBAC) and supports:

* User lifecycle management (CRUD)
* Role assignment & enforcement
* Status control (active/inactive)
* Redis-backed caching for performance

This module must be **cleanly separable** in the future (microservice-ready).

---

# 🧠 Scope of Phase 2

### You MUST implement:

* User data model
* User CRUD APIs
* Role assignment logic
* User status management
* Integration with Auth (JWT + RBAC)
* Redis caching for user + role data

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT duplicate authentication logic (reuse Phase 1)

* ❌ DO NOT tightly couple with Finance/Analytics modules

* ❌ DO NOT expose sensitive data (passwords, internal fields)

* ❌ DO NOT bypass RBAC middleware

* ✅ MUST use JWT from Phase 1

* ✅ MUST enforce role-based permissions

* ✅ MUST design schema for future scaling

* ✅ MUST support clean extraction to microservice

---

# 🏗️ Expected Folder Structure

```plaintext id="p2struct"
/src
  /modules
    /user
      user.controller.js
      user.service.js
      user.repository.js
      user.routes.js
      user.types.js
  /shared
    /db
    /cache
    /middleware
```

---

# 🗄️ Data Model

## User Table

```plaintext id="p2schema"
users
------
id (uuid, primary key)
name (string)
email (string, unique)
password (hashed)
role (enum: admin | analyst | viewer)
status (enum: active | inactive)
created_at
updated_at
```

---

# 🔐 Functional Requirements

## 1. Create User

### Endpoint:

```http id="p2create"
POST /users
```

### Access:

👉 Admin ONLY

---

### Input:

```json id="p2createinput"
{
  "name": "Yash",
  "email": "yash@example.com",
  "password": "securePassword",
  "role": "analyst"
}
```

---

### Logic:

* Validate input
* Hash password
* Store user
* Cache role in Redis

---

---

## 2. Get User

### Endpoint:

```http id="p2get"
GET /users/:id
```

### Access:

* Admin → any user
* Analyst/Viewer → only self

---

---

## 3. Update User

### Endpoint:

```http id="p2update"
PUT /users/:id
```

### Access:

* Admin → full update
* User → limited (name only)

---

### Special Case:

If role changes:
👉 MUST invalidate Redis cache

---

---

## 4. Delete / Deactivate User

### Endpoint:

```http id="p2delete"
DELETE /users/:id
```

### Access:

👉 Admin ONLY

---

### Behavior:

* Soft delete preferred (status = inactive)

---

---

## 5. List Users (Pagination Required)

### Endpoint:

```http id="p2list"
GET /users?page=1&limit=10
```

---

### Requirements:

* Pagination mandatory
* No full table scan
* Indexed queries

---

# 🔐 Role Enforcement Rules

| Action      | Admin | Analyst   | Viewer    |
| ----------- | ----- | --------- | --------- |
| Create User | ✅     | ❌         | ❌         |
| View Users  | ✅     | Limited   | Limited   |
| Update User | ✅     | Self only | Self only |
| Delete User | ✅     | ❌         | ❌         |

---

# ⚡ Redis Caching Strategy

## Key Structure:

```plaintext id="p2redis"
user:{user_id} → {
  role,
  status
}
```

---

## TTL:

```plaintext id="p2ttl"
5–10 minutes
```

---

## Cache Flow:

```plaintext id="p2flow"
Request
 ↓
Check Redis
 ↓
Hit → return data
Miss → fetch DB → cache → return
```

---

## Cache Invalidation (CRITICAL)

Trigger invalidation when:

* Role changes
* Status changes
* User updated

---

# 🔄 Integration with Auth Module

* Use JWT middleware from Phase 1

* Extract:

  * user_id
  * role

* DO NOT re-implement auth logic

---

# ⚡ Non-Functional Requirements

## Performance

* User fetch < 50ms (cached)
* No unnecessary DB queries

---

## Scalability

* Stateless APIs
* Cache-first strategy

---

## Security

* Password must be hashed (bcrypt/argon2)
* No password exposure in API response

---

# 🧪 Edge Cases to Handle

* Duplicate email registration
* Invalid role assignment
* Unauthorized access attempts
* Updating inactive users
* Fetching non-existent users

---

# 🧨 Failure Handling

## Redis Down:

* Fallback to DB
* Log warning

---

## DB Failure:

* Return 500
* Proper error message

---

## Unauthorized Access:

* 403 Forbidden

---

# 🧾 Expected APIs Summary

| Method | Endpoint   | Description     |
| ------ | ---------- | --------------- |
| POST   | /users     | Create user     |
| GET    | /users/:id | Get user        |
| PUT    | /users/:id | Update user     |
| DELETE | /users/:id | Deactivate user |
| GET    | /users     | List users      |

---

# 🧩 Internal Interfaces

## User Service

```plaintext id="p2service"
createUser(data)
getUserById(id)
updateUser(id, data)
deactivateUser(id)
listUsers(pagination)
```

---

## Repository Layer

```plaintext id="p2repo"
findById(id)
findByEmail(email)
create(user)
update(user)
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* User creation
* Role assignment
* Validation logic

---

### Integration Tests:

* RBAC enforcement
* API responses
* Pagination

---

# 📌 Deliverables

* Fully functional User module
* RBAC-protected APIs
* Redis caching implemented
* Clean modular structure
* Secure password handling

---

# 🚫 Common Mistakes to Avoid

* Returning password in response ❌
* Skipping RBAC checks ❌
* No pagination ❌
* Not invalidating cache ❌
* Tight coupling with auth ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Admin can create/manage users
* Users can access allowed data only
* Redis caching works correctly
* RBAC enforcement is consistent
* APIs are secure and performant

---

# 🧠 Final Note for Agent

This module defines **who can do what in the system**.

If implemented poorly:

* Security breaks
* Access leaks occur
* Scaling becomes difficult

Design it as if:
👉 Thousands of admins and millions of users are interacting simultaneously.

---
