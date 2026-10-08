# RED baseline (task 2.4)

Protected suites were authored independently by `behaviour-test-author` against the
seam stubs, before any production behaviour existed. Production code was not changed
between authoring and the runs below. No assertions were changed; no harness fixes
were needed.

## Baseline results

| Suite | Tests | Result at baseline | Failure reason |
|---|---|---|---|
| `tests/acceptance/` (`domain.test.ts`) | 60 | 59 failed, 1 passed | All 59: `not implemented: <fn>` from `shared/domain.ts` stubs. The one pass asserts the constant `PREDICTION_WINDOW_MS = 60000`, which the stub already defined. (Recorded from the author's pre-implementation run.) |
| `tests/contract/` | 23 | 23 failed | 22 × `expected 501 to be 201/401` (stubbed `/api/*` routes). 1 × `not implemented: runSettlementPass`. No connection, fixture or import errors. |
| `e2e/` | 25 | 25 failed | UI is an empty page: `Player-NNNN`, UP/DOWN buttons, price text, chart `figure`, live region not found. No webServer, config or import errors. |

All failures are due to missing behaviour, not to broken setup.

## Scenario-to-test map

Legend: **A** = `tests/acceptance/domain.test.ts`, **C** = `tests/contract/<file>`,
**E** = `e2e/bitcoin-up-down.spec.ts`, **RTL** = React Testing Library test written with
the implementing task (not protected), **M** = manual verification.

### player-identity
| Scenario | Covered by |
|---|---|
| First visit creates a fresh player; generated name; opaque unique ids | C player-identity (creates players…); E first visit and restore |
| Existing player restored; statistics and active prediction restored | C player-identity (restores…); C predictions (me.activePrediction equals prediction); E first visit and restore |
| Stale identifier replaced | C player-identity (401 unknown id); RTL 5.2 (startup replaces identifier) |
| Backend unreachable on startup: retry, identifier kept; loading state | RTL 5.2 |
| Identifiers never exposed to other players | C leaderboards + helper `expectNoPlayerId` on every response |
| Name validation: valid, trim, empty, whitespace, 25/24, control chars, duplicates | A display-name validation; C player-identity (trims valid names…, allows duplicate…) |
| Rename keeps progress | C player-identity (preserves statistics…) |
| Name editing feedback: error linked to input and text kept, Escape cancels, success confirmed | E name editing (3 tests); RTL 5.3 |

### live-market-feed
| Scenario | Covered by |
|---|---|
| Price formatting and update; layout stability | E formats live prices…; E keeps prediction controls in place… |
| Malformed messages ignored | E ignores malformed…; RTL 6.1 |
| Connecting state, controls disabled | E shows a connecting state…; RTL 6.1 |
| Stale at threshold, fresh re-enables | E marks quiet data stale…; RTL 6.1 (exact threshold) |
| Reconnect with backoff | E reconnects after the market connection drops; RTL 6.1 (backoff) |
| Feed failure never changes game state | E stale-state tests; contract settlement (server independent of browser) |
| Chart: collecting state, accessible description | E accessible chart…; RTL 6.2 |
| Chart: new observation extends, old leave the window | RTL 6.2 (not practical end-to-end) |
| Price parsing | A price parsing to cents |

### predictions
| Scenario | Covered by |
|---|---|
| Predict UP/DOWN, server price and clock, client fields ignored | C predictions (creates…); E places UP…; E places DOWN… |
| Invalid direction; unknown player | C predictions (rejects invalid…, requires a valid bearer…) |
| Displayed entry price is the server's | E places UP with the server entry price |
| Controls disabled in flight / without fresh data | E disables both…in flight; E stale test; RTL 7.2, 6.1 |
| One active prediction; 409; concurrent requests | C predictions (second prediction, concurrent) |
| UI re-sync after conflict | E re-syncs…second tab |
| New prediction after settlement | C settlement (permits another prediction) |
| Provider failure: no prediction, retryable, retry succeeds | C predictions (price-provider failures ×2); E retryable creation error |
| Unknown outcome reconciled (network error) | RTL 7.2 |
| Countdown: remaining, Resolving…, device clock, restore on reload | E places UP…; E corrects a device clock…; RTL 7.2 (23 s, 0, skew) |
| WINNING/LOSING/TIED, one cent, unavailable when stale | A live prediction status; E places DOWN…; E UP winning one cent…; RTL 7.2 |
| Active prediction details; entry reference marker | E places UP… (chart reference label); RTL 7.2 |
| Entry reference removed after settlement | E real-time flow (return after settlement); RTL 7.2 |

### prediction-settlement
| Scenario | Covered by |
|---|---|
| Never before eligible (59.999 s; matrix) | A prediction settlement; C settlement (59.999 s / exactly eligibleAt) |
| Outcome by comparison; matrix; exactly at eligibleAt | A; C settlement (both directions) |
| Ties then one-cent move | A; C settlement (repeated ties) |
| Settled without browser; returning player sees result; return price irrelevant | C settlement (lastResult / pass price); E real-time flow |
| UI picks up settlement automatically | E real-time flow (reopen); RTL 8.3 (poll stops when settled) |
| Provider down then recovers | C settlement (outage) |
| Exactly once: duplicate and concurrent | C settlement (repeated and concurrent passes) |
| Settled record fields incl. scoreBefore/After | C settlement (complete lastResult details) |
| Statistics matrix, streaks, negative scores | A statistics and streaks; C settlement (streak, negative) |

### player-progress
| Scenario | Covered by |
|---|---|
| WIN / LOSS cards | E real-time flow (WIN, `+1`, `Score: 0 → 1`); RTL 8.3 (WIN and LOSS cards) |
| Result survives reload; replaced by next prediction; none for new player | E real-time flow (reopen); RTL 8.3 |
| Statistics: with history, rounding, none, update after settlement | RTL 8.3; E real-time flow (statistics updated) |

### leaderboards
| Scenario | Covered by |
|---|---|
| Only eligible players; first loss appears | C leaderboards (excludes new players…) |
| Score ordering and tie-breakers; top-N limit | A leaderboard ordering; C leaderboards (ordering, size limit) |
| Adjusted accuracy examples; predictor ordering; row content | A derived statistics + ordering; C leaderboards (predictor, D7 fields); RTL 9.2 (formatting) |
| Current player marker; outside top entries; not eligible note | E real-time flow (`You`); RTL 9.2 |
| Refresh after own settlement | E real-time flow (leaderboards refreshed) |
| Loading, empty, retryable error | E empty states; E retryable error; RTL 9.2 |

### accessible-responsive-ui
| Scenario | Covered by |
|---|---|
| Widths 375 / 768 / 1280 without horizontal scroll | E no horizontal scrolling |
| Keyboard prediction; accessible names; disabled state exposed | E keyboard only; E tests locate buttons by role and name; RTL 7.2 |
| Colour never the only signal | text assertions throughout E; **M** greyscale check |
| Announcements; no flood | E announces politely…; RTL 10.1 (once per event, silent on ticks) |
| Visible focus; contrast | E axe contrast scan; **M** focus indicator check |
| Reduced motion | `e2e/motion.spec.ts` (task 15.1, see below) |
| Real mobile device | **M** task 10.2 |

## Notes for implementation

- The real-time flow test (about 65 s) and the axe scan fail early on missing UI, so their
  late assertions are not yet exercised. They go GREEN only when the full slice exists.
- The announcement e2e test locates the live region with `[aria-live="polite"]`; the
  implementation must set that attribute explicitly.
- e2e wording assumptions are loose regexes (documented in the spec file); the strict
  strings from the spec (`Resolving…`, `WIN`, `WINNING`, `$67,500.00`, `Score: 0 → 1`,
  `You`) are matched exactly.
- Contract tests accept epoch milliseconds or ISO strings for prediction timestamps. The
  implementation uses epoch milliseconds (design D7 leaves this open).
- Protected suite checksums (no git here): `sha256sum -c openspec/changes/bitcoin-up-down-mvp/protected-checksums.txt`

## Change request: configurable prediction window (task 13.1)

Written by `behaviour-test-author` against the unchanged implementation (which ignored
`PREDICTION_WINDOW_SECONDS` and always used 60 s).

| Test (`tests/contract/prediction-window.test.ts`) | Baseline | Failure reason |
|---|---|---|
| uses a 90-second window and settles only at that eligibility time | failed | `expected 60000 to be 90000` |
| keeps an existing prediction's eligibility when the setting changes | failed | settled at `createdAt + 60 s` (window ignored at creation) |
| rejects a configured prediction window below 60 seconds | failed | stack started (`resolved`) instead of rejecting |
| default window is 60 seconds | passed | already the behaviour |

`tests/acceptance/domain.test.ts`: the `PREDICTION_WINDOW_MS` test was retitled (default and
minimum); its assertion is unchanged and passes. Scenario "The UI states the configured window" is
covered by a React Testing Library test written with task 13.2.

## Repository restructure (task 14.1)

Production code moved into workspace packages. With the owner's approval, `behaviour-test-author`
changed only import specifiers in the protected suites: `../../shared/domain.ts` →
`@btc/shared/domain` (acceptance) and `../../server/settlement.ts` → `@btc/server/settlement`
(four contract files). A line-by-line comparison against a pre-change snapshot showed no other
differences; `e2e/` is byte-identical. Test counts before and after: acceptance 60, contract 27,
e2e 25, unit/RTL 113.

## Chart motion and status transitions (task 15.1)

`e2e/motion.spec.ts` was run against the current implementation. The focused run
has 8 tests: 6 fail for missing motion behaviour and 2 pass as existing guards.
Every motion test suppresses automatic market ticks and sends explicit
Coinbase-shaped ticker messages; chart-frame tests seed two observations before
measuring. No production files or harness utilities were changed.

| Test | Result | Current observation |
|---|---|---|
| redraws the chart many times per second without reduced motion | **failed** | The figure subtree changed in only 1 animation frame during the one-second sample, below the required 20. The chart still advances in one-second steps. |
| limits chart redraws to about twice per second with reduced motion | passed | The chart stayed within the five-frame limit over two seconds with automatic ticks suppressed. |
| describes the latest displayed price after two events less than one second apart | **failed** | After the second price was displayed, the 500 ms assertion still saw the first price (`$67,501.25`) in the figure description instead of `$67,502.50`. No later market event could satisfy the assertion. |
| keeps the price-axis labels unchanged for an in-range price | **failed** | The range included the test price, but the labels changed from `[67499, 67500, 67500, 67501, 67501]` to `[67499, 67500, 67500, 67501, 67502]`. |
| expands to cover a breakout using an even round-number scale | **failed** | Expansion and price coverage occurred, but the visible increments were uneven: the assertion found a 50-dollar difference between consecutive steps (axis labels included `67,275`, `67,775`, `68,275`, `68,775`, `69,225`). |
| keeps a visible time label while it moves left | **failed** | The same time label remained visible, but its x position did not decrease during the 1.5-second sample (expected at least 0.5 px leftward movement). |
| shows LOSING immediately with a brief transition and no layout movement | **failed** | LOSING appeared immediately, and the controls, countdown and price bounding boxes stayed fixed. `getAnimations()` on the status element returned no animations. |
| runs no animations with reduced motion and never animates the price text | passed | `document.getAnimations()` remained empty through status flips and explicit price ticks; no price-text animation ran. This passes because the current UI has no animations at all. |

### Task 15.1 scenario map

| OpenSpec requirement / scenario | Executable evidence or planned verification |
|---|---|
| live-market-feed — Chart moves between market events | `motion.spec.ts`: redraws without reduced motion (**RED**, 1 changed frame vs 20 required). |
| live-market-feed — Time labels move with the line and retain their text | `motion.spec.ts`: visible time label moves left (**RED**, text remains but its x position does not decrease). |
| live-market-feed — Line ends at the latest displayed price | `motion.spec.ts`: two explicit events, no automatic ticks (**RED**, the description remains at the first price after the second is displayed). |
| live-market-feed — Small move keeps the scale | `motion.spec.ts`: in-range labels (**RED**, one label changes). |
| live-market-feed — Breakout expands the scale | `motion.spec.ts`: breakout coverage and even-step labels (**RED**, the resulting increments are uneven). |
| live-market-feed — stale line is not extended; scale contracts after a spike; flat market | RTL/unit tests in task 15.2; stale-line behaviour also receives the task 15.4 manual check. No extra e2e or real-time settlement wait is added here. |
| accessible-responsive-ui — Reduced motion chart | `motion.spec.ts`: reduced-motion redraw frequency (**passes currently** within tolerance). |
| accessible-responsive-ui — Reduced motion status changes | `motion.spec.ts`: no document animations during status flips and explicit ticks (**passes currently**, because no transitions exist). |
| accessible-responsive-ui — Live status changes use a brief transition without layout movement | `motion.spec.ts`: status and bounding-box check (**RED** only at missing status animation; text and layout checks pass). |
| accessible-responsive-ui — Price ticks are not animated | `motion.spec.ts`: price element animation checks in both modes (**passes currently**). |
| accessible-responsive-ui — Result appears with a brief fade and no layout movement | RTL/CSS verification in task 15.3 and manual verification in task 15.4; no 60-second e2e wait is added. |

Verification commands: `pnpm db:up`, `pnpm exec biome check e2e/motion.spec.ts`,
`pnpm typecheck`, `pnpm exec playwright test e2e/motion.spec.ts`, and
`pnpm test:e2e`. The full e2e run exercised 33 tests: all 25 pre-existing
`bitcoin-up-down.spec.ts` tests passed; the 6 motion RED tests failed as above
and the 2 motion guard tests passed, so the overall command exited non-zero as
expected for this pre-implementation baseline. No spec discrepancy was found.

## Smooth chart and status transitions (tasks 15.2, 15.3)

GREEN for `e2e/motion.spec.ts`: 8 of 8 pass (6 were RED at the 15.1 baseline, 2 guards), stable over
4 consecutive runs. The 25 earlier e2e tests, acceptance (60), contract (27) and unit/RTL (128) are green.
Protected checksums are unchanged.

Findings during implementation:
- The "time label moves left" test was flaky (about 25%) while labels were drawn by Recharts. Recharts keys
  ticks by pixel position, so every label was re-created every frame and the test sometimes measured
  detached nodes. Fixed in production code (time labels drawn as an overlay with stable keys, design D13),
  not in the test.
- Counting the latest received price towards "collecting recent price data" showed the chart (and its
  entry-price label) about a second sooner, and 4 protected predictions tests that match
  `$67,500.00` page-wide then hit a strict-mode violation. "Collecting" stays tied to the sampled
  observations (design D9). No protected test was changed.

## Change request: chart window (task 16.1)

The RED tests were run against the existing implementation. The local stack's
`/config.json` returned 200 and exposed `chartWindowSeconds: 300` when the
environment variable was unset. Configuration currently accepts any positive
integer, including values outside the required 60–600 range.

| Test | Baseline | Failure reason |
|---|---|---|
| `tests/contract/chart-window.test.ts` — serves the 120-second default when `CHART_WINDOW_SECONDS` is unset | **failed** | `/config.json` reported 300 instead of 120. |
| `tests/contract/chart-window.test.ts` — serves the configured 60-second chart window | passed | `/config.json` reflected 60. Acceptance at the lower boundary already works. |
| `tests/contract/chart-window.test.ts` — serves the configured 600-second chart window | passed | `/config.json` reflected 600. Acceptance at the upper boundary already works. |
| `tests/contract/chart-window.test.ts` — refuses to start with a 59-second chart window | **failed** | `startStack` resolved; the out-of-range value was accepted instead of causing a configuration error. |
| `tests/contract/chart-window.test.ts` — refuses to start with a 601-second chart window | **failed** | `startStack` resolved; the out-of-range value was accepted instead of causing a configuration error. |
| `e2e/chart-window.spec.ts` — describes the default chart window as the last 2 minutes | **failed** | The visible chart figure's `aria-label` said “BTC/USD price over the last 5 minutes” rather than the required 2 minutes. |

The 60- and 600-second tests pass because current configuration accepts arbitrary
positive integers; they do not establish that the bounds are enforced. The failed
assertions reach the served configuration and visible chart, and the out-of-range
cases genuinely resolve rather than failing during setup.

Verification commands and results:

- `pnpm exec biome check tests/contract/chart-window.test.ts e2e/chart-window.spec.ts` — passed.
- `pnpm typecheck` — passed.
- `pnpm exec vitest run --project contract chart-window` — 2 passed, 3 failed for the behaviour gaps above.
- `pnpm exec playwright test e2e/chart-window.spec.ts` — failed on the 5-minute accessible label.
- `pnpm exec vitest run --project contract --exclude tests/contract/chart-window.test.ts` — existing contract suite passed, 27/27.
- `pnpm exec playwright test e2e/bitcoin-up-down.spec.ts e2e/motion.spec.ts` — existing e2e suites passed, 33/33.

DynamoDB Local was already running, so `pnpm db:up` was not needed. No spec ambiguity
was found; `test-discrepancies.md` was not changed.

### GREEN (task 16.2)

`tests/contract/chart-window.test.ts` 5/5 and `e2e/chart-window.spec.ts` 1/1 pass. All suites are green:
unit/RTL 132, acceptance 60, contract 32, e2e 34. `terraform fmt -check` and `terraform validate` pass, and
the protected checksums are unchanged.

## How-to-play helpers (task 17.1)

Owner-approved helper-only changes; no existing assertion changed:

- `e2e/bitcoin-up-down.spec.ts`, `openGame` (lines 26–39): after navigation,
  wait for the game player's name to be attached; if the named `How to play`
  dialog exists, wait for it to be visible, check its `Don't show again` checkbox
  and activate `Got it` using role/name locators.
- `e2e/motion.spec.ts`, `openGame` (lines 21–34): same wait and optional
  dismissal. `connectToSilentMarket` (lines 58–74) now attaches its
  `subscribe`-frame listener as soon as the WebSocket event arrives. This
  helper-only timing adjustment prevents the new game-ready wait from missing
  that frame; it changes no assertion.
- `e2e/chart-window.spec.ts` (lines 3–15): after its direct `page.goto("/")`,
  wait for the game player's name and perform the same optional role/name-based
  dismissal before the existing chart assertions.

The dialog locator count is checked only after the game is present; it is a
no-op when the dialog is absent. Reloads and additional-page flows need no new
assertions: the first open opts out for that browser context, so reloads and
new tabs correctly follow the specified saved choice. Clock-controlled tests
use the same open helper.

Verification: `pnpm test:e2e` passed all 34 existing tests (25 core game, 1
chart-window, 8 motion) with the dialog still absent. During the first run, a
duplicate player-name locator after settlement and a WebSocket-frame listener
race were found and corrected in helpers only; the final run passed 34/34.

## How-to-play instructions (task 17.2)

Added protected `e2e/instructions.spec.ts` and ran
`pnpm exec playwright test e2e/instructions.spec.ts` against the unchanged
product, which does not yet render the instructions dialog. All 11 tests fail
at the initial positive assertion for
`getByRole("dialog", { name: "How to play" }).toBeVisible()` (2.5 s timeout,
`element(s) not found`). In every case the game player's name was attached
first, so the game screen and test setup were ready; there were no import,
fixture, selector or configuration failures.

| Test | Requirement/scenario | RED result |
|---|---|---|
| Opens the instructions over the game on a first visit | First visit; unchecked default; game behind dialog | Missing named dialog. |
| Shows the instructions again after closing without opting out and reloading | Shown again on next load | Missing initial dialog. |
| Remembers opting out after reload and in another tab in the same browser | Opt out; reload and same-context new tab | Missing initial dialog. |
| Restores the saved checkbox choice and lets the player opt back in | Opt back in; saved checkbox; next load | Missing initial dialog. |
| Explains the round, scoring, leaderboards, and the default one-minute window | Content; configured-window default | Missing named dialog. |
| Keeps keyboard focus in the dialog and returns it to How to play on Escape | Tab containment; Escape; focus restoration | Missing named dialog. |
| Closes with Got it and returns focus to How to play | Button close; focus restoration | Missing named dialog. |
| Does not place a prediction when UP is clicked behind the open dialog | Modal blocks background activation | Missing named dialog. |
| Keeps the same prediction pending and its countdown running while instructions are open | Reopen during active prediction; countdown continues | Missing initial dialog. |
| Keeps the dialog reachable without horizontal page scrolling at 375 pixels | Small-screen reachability and overflow | Missing named dialog. |
| Has no axe violations while the instructions dialog is open | Dialog accessibility scan | Missing named dialog. |

No negative assertion independently passed: each test stops at the initial
missing-dialog assertion, before checking its later transitions, no-prediction,
focus, viewport or axe outcome. The 90-second copy variant is not covered in
e2e: `tests/harness/serve-stack.ts` passes only environment variables ending in
`_MS`, and Playwright starts one web server for the run, so
`PREDICTION_WINDOW_SECONDS` cannot be varied per test. Leave that variant to
RTL in task 17.3. Error/configuration screens and unavailable storage are also
RTL-only per task 17.3.

Verification after authoring: `pnpm exec biome check` on the four changed e2e
files passed; `pnpm typecheck` passed. `e2e/instructions.spec.ts` checksum is in
`protected-checksums.txt`.

### GREEN (task 17.3)

`e2e/instructions.spec.ts` 11/11 pass. All suites are green: unit/RTL 140 (8 new in
`apps/web/src/app/Instructions.test.tsx`), acceptance 60, contract 32, e2e 45. No protected test was changed
during implementation; the checksums verify.

Findings during implementation:
- The first version failed 8 existing protected e2e tests: the closed dialog kept its text in the page, and
  those tests match text page-wide (`/UP/i`, `/DOWN/i`, `/saved|updated/i`), including hidden elements.
  Fixed in production code (content is rendered only while open, design D14), not in the tests.
- A native modal dialog does not wrap Tab inside itself, so the keyboard test failed. Fixed with a small
  Tab wrap-around handler.
- jsdom has no `showModal`/`close`; `apps/web/src/test/setup.ts` has a minimal polyfill.
