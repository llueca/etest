---
name: mvp-scope
description: Use when deciding scope, priorities, non-goals or architecture for a small production-quality MVP.
---

# MVP scope

Treat scope as an engineering constraint.

Classify candidate functionality into:

1. Required
   Without it, the core product promise or workflow is incomplete.

2. High-value small improvement
   Small cost with disproportionate impact on correctness, usability or product coherence.

3. Outside the MVP
   Useful eventually, but not needed for the current product to be complete.

Prefer explicit non-goals when they prevent predictable scope creep.

## Complexity budget

Every new abstraction, dependency, service, layer or subsystem consumes
complexity budget.

Require a concrete current benefit.

"Could be useful later" is not sufficient justification.

## Completeness

Small does not mean careless.

An MVP may still require:

- validation;
- meaningful errors;
- empty states;
- loading feedback;
- persistence correctness;
- accessibility;
- basic responsive behaviour.

Completeness applies to the chosen scope, not to every imaginable feature.

## Decision rule

When two approaches satisfy current requirements similarly well, choose the one
with:

- fewer concepts;
- fewer dependencies;
- less irreversible structure;
- clearer behaviour;
- easier verification.