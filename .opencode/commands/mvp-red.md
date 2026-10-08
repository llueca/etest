---
description: Establish the independent behavioural RED baseline
agent: behaviour-test-author
subagent: true
---

Load `@behaviour-first-testing`.

For the active OpenSpec change, or `$ARGUMENTS` when specified:

Write the behavioural tests that should exist before implementation.

Focus on acceptance criteria, domain rules, contracts and core user journeys.

Run them and establish a meaningful RED baseline.

Do not modify production code.

Finish with a requirement -> test -> expected failure mapping and explicitly
state whether the RED gate is ready for implementation.