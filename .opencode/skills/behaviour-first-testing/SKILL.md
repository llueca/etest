---
name: behaviour-first-testing
description: Use when deriving tests from requirements, establishing a RED baseline, auditing tests or working behaviour-first.
---

# Behaviour-first testing

The purpose of pre-implementation tests is to define observable behaviour
independently of the production implementation.

## Before implementation

Prioritize:

- core acceptance criteria;
- user journeys;
- domain invariants;
- state transitions;
- contracts;
- validation;
- important failure behaviour.

Do not attempt to predict every unit-level implementation detail.

## Test boundaries

Prefer observable inputs and outputs.

For UI:

- roles;
- labels;
- visible text;
- interactions;
- resulting state.

Avoid incidental DOM structure and implementation-specific selectors.

For APIs:

- request;
- response;
- status;
- validation;
- persisted outcome;
- relevant side effects.

For domain logic:

- public behaviour;
- invariants;
- transitions;
- meaningful edge cases.

Avoid requiring internal class names or patterns.

## RED gate

A pre-implementation test is usefully RED only if it fails because the required
behaviour does not exist yet.

These are not meaningful RED states:

- broken imports;
- missing fixtures;
- test configuration errors;
- syntax errors;
- incorrect assumptions about the spec.

## Independence

Production implementation must not retroactively redefine what the behavioural
suite considers correct.

When spec and test disagree, resolve the disagreement explicitly.

## Coverage

Do not optimize for percentage.

Optimize for confidence per test.