# Project Engineering Instructions

## Product goal

Build a small, coherent, production-quality MVP.

The goal is not to build a generalized platform. Prefer the simplest design
that fully supports the required behaviour.

Correctness, product quality, maintainability and clarity are more important
than demonstrating architectural complexity.

## Sources of truth

Product behaviour is defined by the approved OpenSpec artifacts.

Independent acceptance, contract and end-to-end tests provide executable
evidence of that behaviour.

If the specification and an independent behavioural test disagree, do not
silently change either side. Surface the discrepancy and resolve it explicitly.

## Behaviour-first development

Core behaviour must have an independent RED baseline before its production
implementation starts.

Protected behavioural tests live under:

- `tests/acceptance/`
- `tests/contract/`
- `e2e/`

Implementation agents must not modify these tests merely to make them pass.

Implementation-level unit tests may be added during development when useful.

Use a pragmatic RED -> GREEN -> REFACTOR loop.

A RED baseline is valid only when tests fail because required behaviour is
missing, not because of broken fixtures, imports, configuration or test setup.

## Architecture

Keep architecture proportional to current requirements.

Avoid:

- speculative extensibility;
- unnecessary layers;
- generic frameworks created for one use case;
- distributed patterns without a current need;
- abstractions that merely rename existing operations;
- premature performance infrastructure.

Prefer explicit domain rules and straightforward dependencies.

Introduce abstractions when they remove real duplication, protect an important
domain boundary or materially improve testability.

## Frontend

Treat user-facing quality as part of correctness.

Consider:

- loading states;
- empty states;
- validation;
- errors;
- success feedback;
- keyboard interaction;
- accessibility;
- responsive behaviour;
- visual consistency.

Do not add visual complexity that does not improve usability.

## Backend

Keep the backend surface as small as the domain permits.

Validation, persistence semantics and domain invariants must remain explicit.

Do not introduce infrastructure for hypothetical scale.

## Dependencies

Do not introduce a new dependency without a concrete current need.

Prefer existing project conventions and dependencies.

## Verification

Before considering a slice complete:

1. Run its focused tests.
2. Run relevant integration/acceptance tests.
3. Run type checking and linting where available.
4. Remove accidental complexity.
5. Confirm that OpenSpec task state is accurate.

Do not optimize for coverage percentage.

## Git

Keep changes coherent and reviewable.

Do not push, rewrite history or perform destructive Git operations autonomously.

Follow "conventional commit" style for commit messages.