# 📄 Phase 4 — Internal Event Bus (Async Communication Layer)

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Build an **internal event bus system** to enable **asynchronous, decoupled communication** between modules inside the modular monolith.

This phase is critical for:

* Decoupling Finance, Analytics, Notifications, etc.
* Preparing seamless migration to Kafka (Phase 7)
* Improving performance via async side-effects

---

# 🧠 Scope of Phase 4

### You MUST implement:

* In-memory event bus system
* Event publishing mechanism
* Event subscription system
* Event handler execution
* Error handling for failed consumers
* Clean interface abstraction (Kafka-ready)

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT use event bus for synchronous logic

* ❌ DO NOT block API response for event processing

* ❌ DO NOT tightly couple modules via direct calls

* ✅ MUST keep event bus asynchronous

* ✅ MUST design interface for future Kafka replacement

* ✅ MUST ensure failure isolation (consumer crash ≠ system crash)

---

# 🏗️ Expected Folder Structure

```plaintext id="p4struct"
/src
  /shared
    /event-bus
      eventBus.js
      eventTypes.js
      eventHandler.js
      eventQueue.js (optional)
```

---

# 🔥 Core Concept

## Event-Driven Flow

```plaintext id="p4flow"
Producer (Finance Module)
 ↓
Event Bus (publish)
 ↓
Subscribers (Analytics, Logging, Notification)
```

---

# 🧩 Event Structure

## Standard Event Format

```json id="p4event"
{
  "type": "TransactionCreated",
  "payload": {
    "transaction_id": "uuid",
    "user_id": "uuid",
    "amount": 1000,
    "type": "income"
  },
  "timestamp": "ISO_DATE"
}
```

---

# 🔐 Functional Requirements

## 1. Event Bus Interface

Agent MUST implement:

```plaintext id="p4interface"
publish(event)
subscribe(eventType, handler)
unsubscribe(eventType, handler)
```

---

## 2. Event Publishing

### Example (Finance Module):

```plaintext id="p4publish"
publish({
  type: "TransactionCreated",
  payload: {...}
})
```

---

### Requirements:

* Non-blocking
* Fire-and-forget
* Must not affect API latency

---

## 3. Event Subscription

### Example:

```plaintext id="p4subscribe"
subscribe("TransactionCreated", analyticsHandler)
```

---

### Requirements:

* Multiple subscribers allowed
* Independent execution
* No shared state dependency

---

## 4. Event Handler Execution

### Rules:

* Execute asynchronously
* Wrap in try-catch
* Log failures

---

### ⚠️ MUST:

Failure in one handler MUST NOT:

* Affect other handlers
* Crash system

---

# ⚡ Execution Model

## Recommended:

```plaintext id="p4execution"
Event Published
 ↓
Push to internal queue
 ↓
Async execution (setImmediate / worker queue)
 ↓
Handlers process independently
```

---

# 🧨 Failure Handling

## Handler Failure:

* Log error
* Continue execution of other handlers

---

## Retry Strategy (Basic):

* Optional retry (1–2 attempts)
* No infinite retry

---

## Future Upgrade:

* Kafka + DLQ (Phase 7)

---

# ⚡ Performance Requirements

* Publish latency: ~0ms (non-blocking)
* Handler execution: async
* No impact on API response time

---

# 🔄 Integration Requirements

## Finance Module (Phase 3)

MUST emit:

```plaintext id="p4financeevent"
TransactionCreated
```

---

## Example Flow:

```plaintext id="p4exampleflow"
User creates transaction
 ↓
Finance service saves to DB
 ↓
Event emitted
 ↓
Analytics module listens
 ↓
Updates aggregate data
```

---

# 🧪 Edge Cases to Handle

* No subscribers for event
* Multiple subscribers
* Handler throwing error
* High-frequency event bursts

---

# ⚠️ Concurrency Considerations

* Handlers must not block each other
* Avoid shared mutable state
* Use isolated execution

---

# 🧾 Event Types (Initial)

```plaintext id="p4eventtypes"
TransactionCreated
UserUpdated
UserRoleChanged
```

---

# 🧩 Internal Interfaces

## Event Bus

```plaintext id="p4bus"
publish(event)
subscribe(eventType, handler)
```

---

## Handler Signature

```plaintext id="p4handler"
function handler(event) {
  // process event
}
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* Event publish
* Event subscribe
* Handler execution

---

### Integration Tests:

* Finance → Event → Analytics flow
* Multiple handlers execution

---

# 📌 Deliverables

* Fully functional in-memory event bus
* Publish/subscribe working
* Async execution implemented
* Error handling in place
* Ready for Kafka replacement

---

# 🚫 Common Mistakes to Avoid

* Using event bus for sync logic ❌
* Blocking main thread ❌
* Crashing system on handler failure ❌
* Tight coupling between modules ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Events can be published from any module
* Multiple modules can subscribe independently
* Handlers run asynchronously without blocking APIs
* System remains stable even if handlers fail

---

# 🧠 Final Note for Agent

This system is the **foundation of scalability and decoupling**.

Design it as:

* Lightweight (now)
* Replaceable (later with Kafka)

If implemented correctly:
👉 You unlock true event-driven architecture

If implemented poorly:
👉 You create hidden complexity and debugging nightmares

---
