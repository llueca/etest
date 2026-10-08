---
description: Implement the active OpenSpec change against the independent RED baseline
agent: mvp-builder
subagent: false
---

Implement the active OpenSpec change.

Before writing production code:

- confirm the relevant behavioural RED baseline exists;
- if it does not, delegate its creation to `behaviour-test-author`;
- do not proceed until the RED gate is meaningful.

Then implement incrementally using RED -> GREEN -> REFACTOR.

Do not modify protected behavioural tests.

Keep the implementation scoped to the MVP and update OpenSpec task state as
work is completed.