---
name: frontend-product-quality
description: Use when designing, implementing or reviewing user-facing flows, React/UI behaviour, accessibility or frontend polish.
---

# Frontend product quality

Treat the UI as product behaviour, not decoration around backend functionality.

## Core states

For each meaningful workflow consider:

- initial state;
- loading;
- success;
- empty data;
- validation;
- recoverable failure;
- unrecoverable failure where relevant.

Do not mechanically create every state if it cannot occur.

## Interaction

Prefer:

- obvious primary actions;
- useful feedback;
- prevention of accidental duplicate actions where relevant;
- preservation of user input after recoverable errors;
- sensible keyboard behaviour;
- visible focus;
- predictable navigation.

## Accessibility

Use semantic HTML first.

Prefer accessible names and native interaction semantics over custom behaviour.

Check:

- keyboard use;
- focus;
- labels;
- error association;
- contrast where relevant;
- meaningful loading/status feedback.

## Responsive design

Avoid designing only for one viewport.

Prefer layouts that degrade naturally rather than many breakpoint-specific hacks.

## State management

Keep state as local as practical.

Lift or centralize it only when multiple consumers genuinely need shared ownership.

Do not introduce a global store by default.

## Polish

Spend polish budget on clarity, feedback and consistency.

Avoid animation or decorative complexity without product value.