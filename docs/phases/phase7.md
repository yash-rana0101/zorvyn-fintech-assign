# 📄 Phase 7 — Kafka Integration (Distributed Event Streaming)

## Agent Instruction Document (Implementation Guide)

---

# 🎯 Objective

Upgrade the system from an **in-memory event bus** to a **distributed, durable event streaming system using Kafka**.

This phase ensures:

* Reliable event delivery (no data loss)
* Scalability for high throughput
* Replay capability for analytics recovery
* Decoupling between services

---

# 🧠 Scope of Phase 7

### You MUST implement:

* Kafka producer integration (replace internal publish)
* Kafka consumer for Analytics module
* Topic design & configuration
* Retry mechanism for failed events
* Dead Letter Queue (DLQ)
* Graceful fallback (if Kafka unavailable)

---

# ⚠️ Constraints (VERY IMPORTANT)

* ❌ DO NOT break existing system during migration

* ❌ DO NOT tightly couple services with Kafka SDK

* ❌ DO NOT block API requests while publishing events

* ✅ MUST keep abstraction layer (event bus interface)

* ✅ MUST ensure at-least-once delivery

* ✅ MUST design for high throughput

* ✅ MUST handle failures gracefully

---

# 🏗️ Expected Folder Structure

```plaintext id="p7struct"
/src
  /shared
    /event-bus
      eventBus.js         // abstraction
      kafkaProducer.js
      kafkaConsumer.js
      topicConfig.js
      retryHandler.js
      dlqHandler.js
```

---

# 🔥 Core Concept

## Distributed Event Flow

```plaintext id="p7flow"
Finance Module
 ↓
Kafka Producer
 ↓
Kafka Topic
 ↓
Kafka Consumer (Analytics)
 ↓
Processing
 ↓
Update Redis / Analytics DB
```

---

# 🧩 Kafka Topic Design

## Primary Topic

```plaintext id="p7topic"
transactions.events
```

---

## Event Types:

```plaintext id="p7eventtypes"
TransactionCreated
UserUpdated
UserRoleChanged
```

---

## Partitioning Strategy

👉 Partition by:

```plaintext id="p7partition"
user_id
```

---

### Why:

* Ensures order per user
* Enables parallel processing

---

# 🔐 Functional Requirements

## 1. Kafka Producer

### Responsibilities:

* Publish events from Finance module
* Non-blocking
* Retry on failure

---

### Example:

```plaintext id="p7producer"
publish(event) → send to Kafka topic
```

---

### Requirements:

* Async publish
* Acknowledgment handling
* Retry (limited attempts)

---

---

## 2. Kafka Consumer (Analytics)

### Responsibilities:

* Consume events
* Process aggregation logic
* Update Redis cache

---

### Requirements:

* Independent processing
* Auto commit or manual commit (preferred: manual)
* Error handling

---

---

## 3. Retry Mechanism

### On failure:

* Retry event processing (1–3 attempts)

---

### Strategy:

```plaintext id="p7retry"
Fail → Retry → Fail → Send to DLQ
```

---

---

## 4. Dead Letter Queue (DLQ)

## Topic:

```plaintext id="p7dlq"
transactions.dlq
```

---

### Use Case:

* Store failed events
* Debug & reprocess later

---

---

## 5. Event Bus Abstraction (CRITICAL)

### DO NOT call Kafka directly in modules

---

### Use:

```plaintext id="p7interface"
eventBus.publish(event)
eventBus.subscribe(eventType, handler)
```

---

### Internally:

* Replace in-memory bus with Kafka

---

# ⚡ Performance Requirements

* Publish latency: <10ms
* Consumer throughput: scalable
* No blocking in API flow

---

# 🔄 Integration Requirements

## With Finance Module (Phase 3)

* Replace in-memory publish with Kafka producer

---

## With Analytics Module (Phase 5)

* Replace event bus subscription with Kafka consumer

---

# 🧪 Edge Cases to Handle

* Kafka unavailable
* Duplicate event processing
* Consumer crash/restart
* High event burst

---

# 🧨 Failure Handling

## Kafka Down:

* Log error
* Optional fallback to in-memory queue

---

## Duplicate Events:

* Ensure idempotent consumers

---

## Consumer Failure:

* Retry
* Move to DLQ

---

# ⚠️ Concurrency & Consistency

* Use partition key to maintain order
* Ensure idempotent processing in Analytics

---

# 🧾 Expected Enhancements Summary

| Feature               | Status |
| --------------------- | ------ |
| Kafka Producer        | ✅      |
| Kafka Consumer        | ✅      |
| Retry Mechanism       | ✅      |
| DLQ                   | ✅      |
| Event Bus Abstraction | ✅      |

---

# 🧩 Internal Interfaces

## Event Bus

```plaintext id="p7bus"
publish(event)
subscribe(eventType, handler)
```

---

## Kafka Producer

```plaintext id="p7producerinterface"
send(topic, message)
```

---

## Kafka Consumer

```plaintext id="p7consumerinterface"
consume(topic, handler)
```

---

# 🧪 Testing Requirements

Agent MUST include:

### Unit Tests:

* Producer logic
* Consumer processing
* Retry mechanism

---

### Integration Tests:

* End-to-end flow (Finance → Kafka → Analytics)
* DLQ handling
* Failure scenarios

---

# 📌 Deliverables

* Kafka integrated system
* Producer & consumer working
* Retry + DLQ implemented
* Event bus abstraction maintained
* System remains backward compatible

---

# 🚫 Common Mistakes to Avoid

* Direct Kafka usage in modules ❌
* No retry mechanism ❌
* No DLQ ❌
* Blocking API on event publish ❌

---

# 🚀 Completion Criteria

Phase is complete when:

* Events are reliably delivered via Kafka
* Analytics consumes events correctly
* Failed events are retried or sent to DLQ
* System scales without data loss

---

# 🧠 Final Note for Agent

This phase unlocks **true scalability and reliability**.

If done right:
👉 System becomes production-grade

If done wrong:
👉 You introduce data loss and inconsistency

Design for:

* Durability 📦
* Scalability 🚀
* Resilience 🛡️

---
