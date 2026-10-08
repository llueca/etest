---
name: pragmatic-review
description: Use when reviewing code, architecture or a completed MVP for material issues without generating unnecessary work.
---

# Pragmatic review

Review for impact, not for the number of comments produced.

## Priority

Evaluate in this order:

1. correctness;
2. requirement completeness;
3. realistic failure behaviour;
4. data/domain integrity;
5. security basics;
6. user experience;
7. maintainability;
8. unnecessary complexity;
9. performance where evidence suggests it matters;
10. style.

## Findings

A useful finding must contain:

- the concrete problem;
- why it matters;
- where it occurs;
- the smallest reasonable correction.

Avoid speculative warnings without a plausible failure mode.

## Overengineering

Actively look for complexity that can be deleted:

- unused abstractions;
- unnecessary layers;
- generic code serving one concrete case;
- duplicated representations of state;
- premature infrastructure.

## Underengineering

Simplicity is not permission to ignore:

- required validation;
- failure handling;
- domain invariants;
- accessibility;
- data integrity;
- important tests.

## Leave as is

Explicitly preserve decisions that are simple and sufficient.

Do not replace a clear solution merely with a more fashionable pattern.