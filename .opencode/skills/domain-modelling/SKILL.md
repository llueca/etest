---
name: domain-modelling
description: Use when modelling business rules, invariants, state transitions, scoring, ranking or persistence-sensitive domain behaviour.
---

# Pragmatic domain modelling

Model business rules explicitly without turning the project into a DDD showcase.

## Identify

Find:

- entities with meaningful identity;
- immutable values with meaningful validation;
- invariants;
- state transitions;
- calculations;
- uniqueness rules;
- ordering/ranking rules;
- persistence-sensitive behaviour.

## Prefer

Prefer functions and small explicit domain objects when they express the rule clearly.

Introduce richer patterns only when the domain genuinely benefits from them.

## Avoid

Avoid introducing by default:

- repository abstractions over trivial persistence;
- CQRS;
- event sourcing;
- domain event buses;
- factories for simple construction;
- generic base entities;
- speculative bounded contexts.

## Invariants

Keep important rules in one obvious place.

Tests should demonstrate them directly whenever practical.

## Persistence

Do not allow storage details to redefine domain behaviour.

At the same time, do not introduce an abstraction layer merely to claim
persistence independence when no actual benefit exists.