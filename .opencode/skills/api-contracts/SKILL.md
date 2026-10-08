---
name: api-contracts
description: Use when designing, implementing or testing HTTP/API boundaries and persistence-facing contracts.
---

# API contracts

Design the smallest API surface that clearly supports the product behaviour.

## Contract

Make explicit:

- request shape;
- validation;
- successful response;
- relevant error responses;
- identifiers;
- persistence semantics;
- ordering where relevant.

## Errors

Errors should be predictable and actionable.

Differentiate malformed input, invalid domain behaviour and missing resources
when the distinction matters to the client.

Do not create elaborate error taxonomies without product value.

## Validation

Validate at the boundary and preserve domain invariants behind it.

Avoid duplicating the same business rule across multiple layers.

## Idempotency and concurrency

Consider them when the operation realistically needs them.

Do not add infrastructure merely because a production system could eventually
receive concurrent requests.

## Tests

Contract tests should verify externally observable behaviour rather than route
handler internals.