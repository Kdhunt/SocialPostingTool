# Phase 8 Prompt: Delivery Engine

Implement the internal delivery engine using Redis and BullMQ.

Required behavior:

- Recipient expansion
- Audience overlap resolution
- One message per person per channel by default
- Idempotency keys
- Delivery batches
- Delivery recipients
- Delivery attempts
- Retry policy
- Dead letter handling
- Partial success
- Provider isolation
- Structured error reporting
- Audit events

Create provider interfaces for:

- Email
- SMS
- Facebook Page

Use simulated adapters only in this phase.

Add tests proving retries do not duplicate deliveries or social posts.
