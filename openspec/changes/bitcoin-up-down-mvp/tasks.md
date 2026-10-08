# Tasks

## 1. Foundation: tooling, harness and seam stubs (no product behaviour)

- [x] 1.1 Create the single pnpm package:
  - `packageManager` pinned to the pnpm version in use;
  - TypeScript config and the directory layout from design D11 (`web/`, `server/`, `shared/`, `infra/`, `scripts/`, `tests/acceptance/`, `tests/contract/`, `e2e/`);
  - package scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:unit` (server unit tests and React Testing Library tests), `test:acceptance`, `test:contract`, `test:e2e`.

  Verify with `pnpm install`, `pnpm typecheck` and `pnpm lint` on the empty skeleton, and confirm that `pnpm-lock.yaml` is created.
- [x] 1.2 Add dev dependencies with a concrete need: Vitest, jsdom, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, Playwright, `@axe-core/playwright`, ESLint/typescript-eslint, esbuild and Vite. Add runtime dependencies: React, Recharts, Hono, `@hono/node-server` and AWS SDK v3 DynamoDB clients. Configure Vitest so `web/**/*.test.tsx` runs in jsdom with jest-dom matchers, and add a trivial React Testing Library smoke test. Approve only the dependency build scripts that are required (e.g. esbuild) under pnpm's build-script policy. Verify that `pnpm ls` resolves cleanly, that `pnpm install` reports no unapproved build scripts, and that `pnpm exec playwright install` completes.
- [x] 1.3 Add `docker compose` for DynamoDB Local and a script that creates the `players` table with the `pending`, `score-lb` and `accuracy-lb` GSIs (design D4). Verify that the script creates the table, using `aws dynamodb describe-table --endpoint-url` or an equivalent SDK call.
- [x] 1.4 Add configuration loading with validation for every variable in design D10. Invalid values must fail fast. Verify with a unit test that a bad value (e.g. `NAME_MAX_LENGTH=0`) is rejected and that defaults apply when values are unset.
- [x] 1.5 Create seam stubs so that behavioural tests compile and fail for missing behaviour rather than broken imports:
  - `shared/domain.ts`, exporting every function and constant in design D6, each throwing `not implemented`;
  - `server/settlement.ts`, exporting `runSettlementPass`, which throws;
  - a Hono app whose `/api/*` routes all return `501`;
  - a local dev server that serves the app plus `config.json`;
  - a web shell that renders an empty page.

  Verify that `pnpm dev` starts and that `GET /api/me` returns `501`.
- [x] 1.6 Add test harness utilities:
  - a stub market REST server with controllable price, delay and failure;
  - a stub WebSocket server that emits Coinbase-shaped `ticker` messages and can go silent or drop connections on command;
  - a fixture that starts the full local stack, pointing it at the stubs and DynamoDB Local through configuration only.

  Verify with a trivial harness self-test that the fixture boots and tears down.

## 2. RED baseline: independent behavioural tests (authored by behaviour-test-author, no production code)

- [x] 2.1 Write `tests/acceptance/` against the `shared/domain.ts` seam (design D6), covering:
  - the settlement matrix (spec prediction-settlement, including exactly-at-eligibleAt and 59.999 s);
  - the statistics matrix and streak progression;
  - negative scores;
  - derived games and accuracy, plus adjusted-accuracy examples A to D;
  - score and predictor ordering, including every tie-breaker;
  - display-name validation, including trim, empty, whitespace, max length, control characters and the 24/25 boundary;
  - live status, including the one-cent difference;
  - price parsing to cents.

  Verify that `pnpm test:acceptance` fails only with `not implemented`.
- [x] 2.2 Write `tests/contract/` against the HTTP API (design D7) and `runSettlementPass(now)` (design D8), with DynamoDB Local and the stub market REST server, covering:
  - player creation and its defaults, plus opaque, unique identifiers;
  - `GET /api/me` restore, and `401` for an unknown identifier;
  - `PATCH /api/me` validation and that statistics are preserved;
  - prediction creation, including server-set price and timing, ignored client fields, an invalid direction and `401`;
  - `409` on a second prediction, and exactly one success out of concurrent UP/DOWN requests;
  - `503` with no prediction when the provider fails or times out;
  - settlement:
    - not before eligibleAt;
    - won/lost/pending outcomes;
    - repeated ties followed by a one-cent move;
    - provider down then recovered;
    - idempotent and concurrent passes;
    - `lastResult` content, including `scoreBefore`/`scoreAfter`;
  - leaderboards: eligibility, ordering, size limit, `isCurrentPlayer`, and no `playerId` in any entry;
  - `serverTime` present in every response.

  Verify that `pnpm test:contract` fails with `501` or `not implemented`, not with harness errors.
- [x] 2.3 Write `e2e/` Playwright tests against the local stack. Use role- and name-based queries derived from the spec wording. Cover:
  - first visit and restore after reload;
  - name editing: success, validation and cancel with Escape;
  - live price: formatting, connecting state, stale state blocking predictions, reconnect;
  - chart: shown, and the collecting state;
  - predict UP and DOWN, with the entry price and countdown, using Playwright clock control for countdown and Resolving;
  - a device clock offset;
  - WINNING/LOSING/TIED, and live status unavailable while stale;
  - the entry-price marker;
  - controls disabled while a request is in flight;
  - conflict re-sync across two tabs;
  - a creation error followed by a successful retry;
  - one real-time flow (about 65 s): place → close page → reopen → WIN result with `+1` and `Score: x → y`, statistics updated, leaderboard refreshed;
  - leaderboard empty and error states, and the "You" marker;
  - no horizontal scroll at 375/768/1280 px;
  - keyboard-only prediction;
  - an axe scan with no contrast violations.

  Verify that `pnpm test:e2e` fails because the behaviour is missing.
- [x] 2.4 Audit the RED baseline:
  - run all three suites;
  - record each failing test's reason;
  - fix only harness or fixture problems, never assertions;
  - map every spec scenario to at least one test, or to an explicit note on why it is verified manually (e.g. "page not re-initialised").

  Verify by attaching the scenario-to-test map to the change (`openspec/changes/bitcoin-up-down-mvp/red-baseline.md`).

## 3. Walking skeleton on AWS (infrastructure, de-risking)

- [x] 3.1 Write the Terraform root module in `infra/` (design D12):
  - S3 backend (partial config plus `backend.hcl.example`);
  - private S3 bucket with OAC, CloudFront with the `/api/*` behaviour (caching disabled) and the managed security-headers policy;
  - HTTP API;
  - API and settler Lambdas (`nodejs24.x`, arm64, `archive_file` from esbuild output) with least-privilege IAM;
  - DynamoDB table and GSIs (on-demand, PITR);
  - EventBridge `rate(1 minute)` rule;
  - log groups with retention;
  - all D10 variables, feeding the Lambda environment and the `config.json` S3 object.

  Verify that `terraform fmt -check` and `terraform validate` pass.
- [x] 3.2 Bootstrap the Terraform state backend (design D12, one time, with the AWS CLI): bucket `btc-up-down-tfstate-<account-id>` in `eu-central-1`, with versioning, SSE-S3 default encryption and all public access blocked. Write `infra/backend.hcl` from the example (key `btc-up-down/terraform.tfstate`, `use_lockfile = true`). Verify with `get-bucket-versioning`, `get-bucket-encryption` and `get-public-access-block`, and that `terraform init -backend-config=backend.hcl` succeeds. Document the bootstrap commands in the README deployment section.
- [x] 3.3 Make the deploy independent of the AWS CLI's default region (design D12): add a `region` Terraform output, and have `scripts/deploy` export `AWS_DEFAULT_REGION` from it before its `aws` calls. Keep `infra/.terraform.lock.hcl` committed (it is not git-ignored). Verify that `terraform fmt -check` and `terraform validate` pass, and that `bash -n scripts/deploy` succeeds.
- [x] 3.4 First deploy (owner approval required before `apply`): run `scripts/deploy`, review the plan, and apply only after the owner confirms. Verify:
  - the CloudFront URL serves the app shell;
  - `/config.json` has the expected values (e.g. `chartWindowSeconds` 120, `predictionWindowSeconds` 60);
  - `GET /api/me` without a token answers `401`;
  - `GET /api/leaderboards` answers `200`.
- [x] 3.5 Verify that Coinbase is reachable from both Lambdas through existing behaviour (design D12), with no temporary code:
  - create a player and an UP prediction with `curl`: `201` with an entry price, not `503`;
  - after `eligibleAt`, `/api/me` shows the settled result within the specified bound;
  - the settler log group has a `settled` entry and no `price_unavailable`.

  Record the outcome in design Risks. If either check fails, stop and raise it with the owner before continuing.

## 4. Slice: domain rules (GREEN for tests/acceptance)

- [x] 4.1 Implement `shared/domain.ts`:
  - settlement evaluation, outcome application and derived statistics;
  - live status;
  - ranking comparators;
  - name validation;
  - exact cents parsing.

  Verify that `pnpm test:acceptance` passes, with no changes to protected tests.
- [x] 4.2 Implement the leaderboard rank-key encoders (design D4). Add a unit test asserting that sorting by encoded key equals sorting by the D6 comparators over generated player sets, including negative scores and ties. Verify that the unit test passes.

## 5. Slice: player identity (US-01–03)

- [x] 5.1 Implement `POST /api/players`, `GET /api/me` and `PATCH /api/me` with the D4 conditional writes, the `Player-NNNN` name generator and the `serverTime` field. Verify that the identity and rename tests in `tests/contract/` pass.
- [x] 5.2 Implement web startup:
  - load `config.json`;
  - read the localStorage identifier;
  - restore, create, or replace an unknown identifier;
  - a loading state;
  - a retryable error that keeps the stored identifier;
  - a configuration error state.

  Add React Testing Library tests for the loading, retryable-error (the stored identifier is kept) and configuration-error states. Verify that these tests pass, along with the first-visit and restore e2e tests.
- [x] 5.3 Implement the inline name editor: trim, show the error next to the input, keep the input on error, saving state, Escape to cancel, success confirmation. Add React Testing Library tests (user-event) for the validation message being linked to the input, the input being kept after an error, and Escape cancelling. Verify that these tests pass, along with the name-editing e2e tests.

## 6. Slice: live market feed (US-04, US-05, US-26)

- [x] 6.1 Implement the Coinbase WebSocket feed:
  - parsing with `parsePriceToCents`;
  - ignoring invalid messages;
  - connecting, live and stale states based on `STALE_THRESHOLD_MS`;
  - exponential reconnect from 1 s up to 30 s;
  - one render per animation frame;
  - formatted price display using tabular numerals.

  Add React Testing Library tests with fake timers and a fake WebSocket covering:
  - connecting → live → stale at exactly `STALE_THRESHOLD_MS`;
  - invalid messages ignored;
  - the reconnecting indication and backoff;
  - UP/DOWN disabled while the feed is not fresh.

  Verify that these tests pass, along with the live-price, stale and reconnect e2e tests.
- [x] 6.2 Implement the rolling chart with Recharts (design D9):
  - `LineChart` over observations sampled at most once per second, within a `CHART_WINDOW_SECONDS` window;
  - animation off;
  - fixed-height container;
  - a collecting state for fewer than 2 points;
  - a `figure` with an `aria-label` summary.

  Add React Testing Library tests for the collecting state, the accessible summary and old observations dropping out of the window. Verify that these tests pass, along with the chart e2e tests.

## 7. Slice: placing and following predictions (US-06–11, US-27)

- [x] 7.1 Implement `POST /api/me/predictions`:
  - direction validation;
  - an authoritative REST ticker fetch with `MARKET_TIMEOUT_MS`;
  - the conditional write;
  - `409` and `503` mapping.

  Verify that the prediction-creation contract tests pass, including the concurrency test.
- [x] 7.2 Implement the prediction controls and the active-prediction view:
  - enabled/disabled rules, with visible reasons and `aria-describedby`;
  - in-flight lock;
  - countdown using the server clock offset, clamped, then `Resolving…`;
  - live status, or "unavailable" when the feed is stale;
  - entry price shown on the chart as a dashed, labelled Recharts `ReferenceLine`;
  - re-sync on `409`, network error and visibility change;
  - retryable error.

  Add React Testing Library tests with fake timers covering:
  - the countdown at 23 s, at 0 → `Resolving…` and never negative, with a skewed device clock;
  - WINNING, LOSING and TIED, including a one-cent difference, and "unavailable" when the feed is stale;
  - disabled reasons exposed through `aria-describedby`;
  - the in-flight lock;
  - the entry-line label.

  Verify that these tests pass, along with the predict, countdown, live-status, conflict and creation-error e2e tests.

## 8. Slice: settlement, results and statistics (US-12–23, US-28)

- [x] 8.1 Implement `runSettlementPass(now)`:
  - query the pending GSI;
  - fetch one price per pass;
  - strongly consistent read;
  - `evaluateSettlement` and `applyOutcome`;
  - conditional write that sets `lastResult` and the rank keys and clears the pending keys;
  - structured logs.

  Verify that all settlement contract tests pass.
- [x] 8.2 Implement the settler Lambda loop (design D3) and the local dev server's interval loop, both calling `runSettlementPass`. Verify with a unit test using fake time and a fake pass that the loop exits early when nothing is due and stops at the end of its run. Then check in local dev that a prediction settles within 10 s of eligibleAt.
- [x] 8.3 Implement the web resolving poll (`RESOLVE_POLL_INTERVAL_MS`):
  - WIN and LOSS result feedback (text labels, direction, `entry → settlement`, `±1`, `Score: before → after`);
  - result kept until the next prediction;
  - first-prediction invitation;
  - statistics summary (whole-percent accuracy or `—`, current and best streak).

  Add React Testing Library tests for:
  - the WIN and LOSS cards, with all their elements;
  - accuracy formatting (`70%`, `67%`, `—`);
  - the first-prediction invitation;
  - the resolving poll stopping once the prediction is settled.

  Verify that these tests pass, along with the real-time settlement e2e test and the result and statistics e2e tests.

## 9. Slice: leaderboards (US-24, US-25)

- [x] 9.1 Implement `GET /api/leaderboards`: GSI queries limited to `LEADERBOARD_SIZE`, sequential positions, `isCurrentPlayer` from the optional bearer, and no identifiers. Verify that the leaderboard contract tests pass.
- [x] 9.2 Implement both leaderboard panels:
  - rows, with the predictor board showing adjusted accuracy to 1 decimal, raw accuracy as a whole percent and games played;
  - a "You" text marker;
  - the current player's own values shown separately when outside the top entries;
  - a not-yet-eligible note;
  - loading, empty and retryable error states that do not block gameplay;
  - a refresh after the player's own settlement or rename;
  - responsive placement.

  Add React Testing Library tests for:
  - the loading, empty and error-with-retry states;
  - the "You" marker;
  - the current player's own values shown when outside the top entries;
  - the not-yet-eligible note;
  - predictor-row formatting (`61.5%`, `100%`, `3`).

  Verify that these tests pass, along with the leaderboard e2e tests.

## 10. Cross-cutting accessibility and responsiveness (US-29, US-30)

- [x] 10.1 Implement the polite live-region announcements:
  - announce: prediction placed, `Resolving…`, result, errors, feed lost and restored;
  - do not announce: individual ticks, countdown seconds or WINNING/LOSING flips;
  - add visible focus styles;
  - check AA contrast tokens;
  - add the reduced-motion guard.

  Add React Testing Library tests showing that the live region announces each listed event once, and stays silent across repeated price ticks, countdown seconds and WINNING/LOSING flips. Verify that these tests pass, along with the keyboard, announcement and axe e2e tests.
- [x] 10.2 Check the layouts at 375, 768 and 1280 px. Verify that the no-horizontal-scroll e2e tests pass, plus a manual check on a real mobile browser.

## 11. Integration verification and documentation

- [x] 11.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:acceptance`, `pnpm test:contract` and `pnpm test:e2e`. Verify that everything is green and that `git diff` shows no changes to the protected test suites since 2.4, other than recorded harness fixes.
- [x] 11.2 Run the deployed smoke checklist in a real browser on the CloudFront URL:
  - first visit creates a player, and the How to play dialog is open;
  - "Don't show again" holds after a reload;
  - a reload restores the player;
  - the live price shows, and the chart moves smoothly over the last 2 minutes;
  - an UP prediction settles with the browser closed;
  - the result and statistics show on return;
  - the leaderboards show the player.

  Also document the teardown (`terraform destroy`; the state bucket is kept) and the expected monthly cost in the README. Verify by recording the checklist results in the README.

- [x] 11.3 Write the README:
  - architecture overview;
  - the settlement approach and why it is fair;
  - configuration table;
  - local development and tests;
  - deployment and rollback;
  - deliberate omissions.

  Verify that a fresh clone can follow it to run `pnpm dev` and the test suites.
- [x] 11.4 Review for accidental complexity: remove unused code, dependencies and configuration. Confirm that every task box in this file reflects reality. Verify with a reviewer pass, with no material findings left open.

  Review pass 1 (reviewer subagent): no unused dependencies, outputs or CSS; native `<dialog>`, Recharts and the chart helpers confirmed proportionate. Four findings:
  - fixed: the chart dropped the latest price when it arrived in the same millisecond as a sample (unit test added);
  - fixed: Terraform accepted fractional values that the shared config loader rejects (whole-number validation on six variables);
  - fixed: four internal-only exports removed (type exports used in public signatures kept on purpose);
  - closed by 15.4: no automated evidence for the result-card fade and its reduced-motion override (the 60 s real-time wait was deliberately not added to e2e); the owner verified it manually.

  Review pass 2 (reviewer subagent, 2026-10-08): no Critical or High findings. Marked done by the owner (2026-10-08). Three Medium findings were reported (error responses omit `serverTime`, contrary to D7; a failed re-sync after an unknown outcome re-enables UP/DOWN; the result reveal may change the status panel height). They were fixed in section 18.

## 12. Optional polish

Superseded by section 15. Motion is now required. Per-tick price animation was deliberately dropped (see the proposal).

## 13. Change request: configurable prediction window (default and minimum 60 s)

- [x] 13.1 Independent RED tests (behaviour-test-author) for the new requirement "Prediction window is configurable with a 60-second minimum":
  - `tests/contract/`: with `PREDICTION_WINDOW_SECONDS=90`, `eligibleAt` = `createdAt` + 90 s; no settlement at + 89.999 s; settlement at + 90 s; the default stays 60 s; a prediction created with 90 s is not settled at + 60 s after the setting changes to 60;
  - `tests/acceptance/`: `PREDICTION_WINDOW_MS` is the default and minimum (title no longer says "fixed").

  Verify that the new tests fail only because the window is not configurable yet, and record them in `red-baseline.md`.
- [x] 13.2 Implement `PREDICTION_WINDOW_SECONDS` (default 60, below 60 rejected at start-up) in configuration, prediction creation, `config.json` and the invitation copy; add the Terraform variable with the same validation; update the README configuration table. Add unit tests for the configuration bounds and React Testing Library tests for the copy. Verify that every suite is green.

## 14. Change request: monorepo and feature-based layout (no behaviour change)

- [x] 14.1 Restructure into a pnpm workspace (`apps/web`, `apps/server`, `packages/shared`) with feature-based trees in both apps (components, hooks, routes, stores and views grouped per feature; generic UI, hooks, API client and test utilities in their own folders). Protected suites stay at their paths; only their import specifiers change (by `behaviour-test-author`, approved by the owner). Verify that every suite passes with the same test counts as before, that `pnpm dev`, `pnpm build` and `terraform validate` work, and that the protected suites differ from before only in import lines.
- [x] 14.2 Re-enable Biome's recommended lint rules (an earlier automatic config migration had set the rule preset to `none`, so lint checked no rules). Address the findings without behaviour changes: justified suppressions for intentional hook dependencies and the button group's `role="group"`, and a config override for duplicate `afterEach` hooks in the protected contract suite.

## 15. Change request: smooth chart and status transitions (design D13)

- [x] 15.1 Independent RED tests (behaviour-test-author) in a new protected file `e2e/motion.spec.ts` for the requirements "Chart moves smoothly with time", "Chart line ends at the latest received price" and "Price scale stays steady" (live-market-feed), and "Motion respects user preference" (new scenarios) and "Status changes use brief transitions that do not move the layout" (accessible-responsive-ui):
  - the chart figure is redrawn at least 20 times in one second without reduced motion, and no more than about twice per second with reduced motion;
  - after two price events less than 1 s apart, the chart's accessible description shows the displayed price;
  - price-axis labels are unchanged after a price inside the range, expand to round even steps after a breakout;
  - a visible time label keeps its text while its x position decreases;
  - live status flip WINNING → LOSING: text immediately correct, a transition runs on it and ends within 300 ms; controls, countdown and price do not move;
  - with reduced motion, no animations are running in the document across a status flip and price ticks (`document.getAnimations()`), and the price text never animates in either mode.

  Do not add another real-time 60 s wait; leave the fade-in of the result card to the implementing task (RTL/CSS) and the manual check in 15.4. Record the new tests and their failure reasons in `red-baseline.md` and update `protected-checksums.txt`. Verify that they fail only because the behaviour is missing, and that the existing e2e tests stay green.
- [x] 15.2 Implement chart motion (D13): frame clock with reduced-motion fallback, explicit time ticks at round clock times, a live end point while fresh (none while stale), and the steady price axis. Add unit tests for the range rules (expansion, contraction below half, minimum span for a flat line, step selection never below $1) and an RTL test that the line is not extended while stale. Verify that the motion e2e tests and the whole existing suite pass.
- [x] 15.3 Implement the status and result transitions in CSS (≤ 300 ms, colour/opacity/transform only) with a single `prefers-reduced-motion: reduce` block. Verify that the motion e2e tests pass, and that the e2e suite stays green at 375, 768 and 1280 px.
- [x] 15.4 Manual verification and record the results in design Risks:
  - Chrome Performance panel at 4× CPU slowdown on the game screen: no long tasks and no dropped-frame streaks from the chart;
  - a real phone;
  - the result card fades in without moving other elements;
  - with the OS reduced-motion setting, the chart steps once per second and nothing animates.

  If the performance budget is not met, stop and raise it with the owner. Do not lower the requirement silently.

## 16. Change request: 2-minute chart window, bounded to 60 s–10 min

- [x] 16.1 Independent RED tests (behaviour-test-author) for the requirement "Chart window is a deployment setting from 60 seconds to 10 minutes" and the new default in "Rolling chart of recent prices" (live-market-feed):
  - `tests/contract/`: with no `CHART_WINDOW_SECONDS`, `config.json` has `chartWindowSeconds` 120; the stack starts with 60 and with 600, and refuses to start with 59 and with 601 (same approach as the prediction-window test);
  - `e2e/`: with the default configuration, the chart's accessible description states the last 2 minutes.

  Verify that the new tests fail only because the default and the bounds are not implemented yet, record them in `red-baseline.md` and update `protected-checksums.txt`.
- [x] 16.2 Implement the default (120) and the bounds (60–600) in the shared configuration loader, the Terraform variable (default and validation) and the README configuration table. Update the config unit tests for the new default and bounds. Verify that `terraform fmt -check` and `terraform validate` pass and that every suite is green.

## 17. Change request: how-to-play instructions (design D14)

- [x] 17.1 Owner-approved helper update to the protected e2e suites (behaviour-test-author). In `e2e/bitcoin-up-down.spec.ts`, `e2e/motion.spec.ts` and `e2e/chart-window.spec.ts`, only the shared open/reload helpers (and the direct `page.goto` in `chart-window.spec.ts`) change: when the "How to play" dialog is open, check "Don't show again" and choose "Got it", through roles and names only. No assertion changes. The helper must be a no-op while the dialog does not exist yet, so the suites stay green before implementation. Record the change in `red-baseline.md` (as for 14.1) and update `protected-checksums.txt`. Verify that the 34 existing e2e tests pass unchanged in count.
- [x] 17.2 Independent RED tests (behaviour-test-author) in a new protected file `e2e/instructions.spec.ts` for the `game-instructions` spec:
  - first visit: open on game screen; reload shows it again when not opted out;
  - opt out: not shown after reload or in a new tab of the same context;
  - opt back in: checkbox reflects the saved choice; uncheck → shown on next load;
  - content: key facts and "1 minute" with the default window (90 seconds with `PREDICTION_WINDOW_SECONDS=90`, if the harness allows it per test; otherwise leave that to RTL in 17.3);
  - keyboard: Tab stays inside; Escape closes; focus on "How to play"; "Got it" closes;
  - background blocked: UP cannot be activated while open (no prediction is created);
  - reopen during an active prediction; the prediction is still pending afterwards with the countdown continuing;
  - 375 px: dialog controls reachable and no horizontal page scroll;
  - axe: no violations with the dialog open.

  Leave the error-screen and storage-unavailable scenarios to React Testing Library in 17.3. Verify that the new tests fail only because the dialog does not exist yet, and record them in `red-baseline.md` and `protected-checksums.txt`.
- [x] 17.3 Implement the dialog, the "How to play" button, the preference and the content (D14). Add React Testing Library tests for:
  - no dialog on the loading and error screens;
  - storage that throws: dialog shown, no error, choice not remembered;
  - the configured window in the copy (90 seconds);
  - opening at most once per page load.

  Verify that `e2e/instructions.spec.ts`, every existing suite, typecheck and lint pass, with no horizontal scroll at 375, 768 and 1280 px.

  Notes for the implementer (from 17.1 and 17.2):
  - the protected helpers look for the dialog as soon as the player name is attached, so it must already be open in that commit. Call `showModal()` from a layout effect, not a regular effect;
  - the accessible names are exact: dialog and button "How to play", checkbox "Don't show again" (straight apostrophe), button "Got it";
  - on close by any route (Got it or Escape), focus goes to the "How to play" button through a ref. Focus "Got it" when the dialog opens;
  - the checkbox saves on every change, and is read again each time the dialog opens;
  - the content wording is checked by regular expressions in `e2e/instructions.spec.ts`. Read it before writing the copy, and keep the text natural rather than echoing the patterns;
  - `Game` mounts once per page load, so keeping the open flag there (initially "not opted out") gives "at most once per load" and keeps the dialog off the loading and error screens.

## 18. Review follow-up (no new product behaviour)

- [x] 18.1 Every API response carries `serverTime` (design D7), errors included: `fail()` builds on `ok()`, and an unknown `/api/*` path now answers `404 not_found` instead of the task 1.5 stub's `501`. Covered by `tests/integration/error-responses.test.ts` (RED first: 5 failures, then green). Protected suites unchanged.
- [x] 18.2 After a prediction request with an unknown outcome (no response) or a `409`, if the re-sync also fails, UP/DOWN stay blocked with the reason "Confirm your prediction status first." and a "Check again" button, until a read succeeds (spec: "Unknown outcome is reconciled"). A definite `503` still re-enables the controls. React Testing Library tests in `apps/web/src/app/Game.test.tsx` (RED first: 4 failures, then green).
- [x] 18.3 The result reveal no longer moves the content below at 375 px: the status panel and progress row share a `.play-body` with a reserved minimum height. Measured with a throwaway Playwright probe against the real stack (a 60 s prediction settled at 375 and 1280 px): before, the stats card moved up by 12 px at 375 px and nothing moved at 1280 px; after, nothing moves at either width. At 320 px (not a specified width) the progress row wraps and a 28 px shift remains; this is accepted.

- [x] 18.4 An older read of the player no longer overwrites newer state (review pass 3). In `useGame.ts` reads are numbered when they start and shown only if newer than what is on screen; a prediction or rename takes a number when its response arrives, so it beats reads still in flight. A skipped read still returns its data to the caller. Two React Testing Library tests release held `GET /api/me` answers out of order (RED first: both failed after the older answer arrived, then green): an older "pending" read after a newer "settled" one, and a read started before a new prediction. All suites green: unit 153, acceptance 60, contract 32, e2e 45; protected checksums unchanged.

## 19. Final review follow-up (no new product behaviour)

- [x] 19.1 Client request time limit: every API request and `config.json` is aborted after 15 s (body included) and handled as a network error, so a stalled prediction request goes through the existing unknown-outcome re-sync and startup ends in its retryable error instead of loading forever (design D7). React Testing Library tests: a prediction request that never answers shows the created prediction after 15 s; a player read that never answers shows the retryable startup error with the stored identifier kept; a `config.json` that never answers shows the configuration error.
- [x] 19.2 Live feed recovery from a silent connection: a WebSocket that stays open without a valid price for `STALE_THRESHOLD_MS` is closed so the existing backoff reconnects it (design D9). Staleness itself is still measured from the last valid price. Unit tests (fake WebSocket and timers): a silent open connection and one that never delivers a price are reconnected; a connection receiving prices stays open. The protected e2e suite stays green (45).

## Workflow follow-up

- Run `/opsx-verify` against the specs, then archive the change once review requirements are met.
