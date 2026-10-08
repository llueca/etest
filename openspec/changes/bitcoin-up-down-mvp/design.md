# Design: Bitcoin Up/Down MVP

## Context

The repository is greenfield (see proposal.md for motivation and scope). Fixed
constraints agreed during exploration:

- **AWS-hosted:**
  - the SPA lives on S3 behind CloudFront;
  - the backend runs on Lambda;
  - scores are stored in DynamoDB.
- **Tooling:** Node.js everywhere, with TypeScript and pnpm. The managed Lambda
  runtime is `nodejs24.x`. Bun was considered and rejected because it would
  need a self-maintained custom Lambda runtime.
- **Infrastructure:** Terraform, chosen as the team-standard tool.
- **Market data:** Coinbase Exchange `BTC-USD`. The browser uses the public
  WebSocket `ticker` channel. The server uses the public REST ticker. Neither
  needs an API key.
- **Configuration:** operational defaults are configurable through environment
  variables.
- **Storage scope:** only the active prediction and the most recent result are
  stored per player.

The central design problem is that settlement must be fair and must not depend
on the browser.

Settling when the player next makes a request ("lazy settlement") would let a
player watch the price elsewhere and return only when it favours them. So the
server must settle near `eligibleAt` on its own schedule, without a long-running
server.

## Goals / Non-Goals

**Goals:**

- The smallest AWS footprint that can settle every prediction within seconds
  of `eligibleAt` and enforce the invariants:
  - one active prediction per player;
  - settle exactly once.

  Both are enforced by the database, not by application locks.
- One code path for the API and settlement, running both on Lambda and
  locally.
- Domain rules kept in one shared, pure module that the browser (live status)
  and the server (settlement) both use.
- Stable seams that let behavioural tests be written before implementation.

**Non-Goals (design-level):**

- No application-owned WebSocket, queue, workflow engine, cache or event bus.
- No repository, service or ports-and-adapters layering around a single table.
- No multi-instance coordination beyond the database's conditional writes.
- No CI/CD pipeline, custom domain, CSP tuning, alarms or dashboards.
- No storage of prediction history. History can be added later without
  migrating existing data.
- No state-management, data-fetching or router libraries. The one UI library
  added is Recharts (D9).

## Architecture

```
                         +--------------------------------------+
  Browser (React SPA)    |              CloudFront              |
  +-----------------+    |  /*      -> S3 (private, OAC)        |
  | app UI          |--->|           index.html, assets,        |
  |                 |    |           config.json (by Terraform) |
  |                 |--->|  /api/*  -> API Gateway HTTP API     |
  +--------+--------+    +-------------------+------------------+
           |                                 |
           | wss (direct, public)            v
           v                         +---------------+    +------------------+
  +------------------+               |  api Lambda   |--->|  DynamoDB        |
  | Coinbase Exchange|<--REST ticker-|  (Hono app)   |    |  table: players  |
  | ws-feed / REST   |               +---------------+    |  GSI pending     |
  +------------------+                                    |  GSI score-lb    |
           ^               +----------------+             |  GSI accuracy-lb |
           +--REST ticker--| settler Lambda |------------>|                  |
                           +-------^--------+             +------------------+
                                   | rate(1 minute)
                           EventBridge rule
```

## Decisions

### D1. One origin through CloudFront; HTTP API → one API Lambda

- CloudFront serves the SPA from a private S3 bucket (Origin Access Control).
  It sends `/api/*` to an API Gateway HTTP API, with caching disabled for that
  path.
- The browser sees a single origin, so there is no CORS configuration.
- A single API Lambda handles every route. The surface is five routes, and
  per-route functions would add infrastructure with no isolation benefit.

**Alternatives considered:**

- **Lambda Function URLs behind CloudFront OAC:** these require clients to send
  a SHA-256 hash of the body on POST/PATCH, which is friction with no gain.
- **API Gateway REST API:** more features and cost than needed.

### D2. Hono as the HTTP layer

- The same Hono app definition runs on Lambda (`hono/aws-lambda`) and locally
  (`@hono/node-server`). That gives local development and contract tests a real
  HTTP server built from production code.
- This is the concrete need that justifies the dependency.
- Validation is hand-written. Only `direction` and `displayName` need
  validating, so a schema library is not justified.

### D3. Scheduled settler driven by database state (not by messages)

An EventBridge rule invokes the settler Lambda every minute. Each invocation:

```
runEnd = start + 60s
loop:
  due = query GSI pending where eligibleAt <= now          (cheap, sparse)
  if due is not empty:
     price = one Coinbase REST ticker fetch (timeout-bounded)
     for each due player: settle with that price (D5 conditional write)
  if no pending prediction has eligibleAt < runEnd: exit
  sleep SETTLEMENT_POLL_INTERVAL_MS (default 1000)
until runEnd
```

- **Why this approach:**
  - There is no message to lose. Saving a prediction is the only thing
    needed to schedule its settlement.
  - Ties (stay pending) and provider outages (stay pending) need no special
    paths; the next tick simply evaluates again.
  - One price fetch serves every prediction due at that tick.
  - An idle invocation exits immediately.
- **Why every prediction is covered:** every prediction is created at least
  60 s before it becomes eligible (the configured window is never shorter than
  60 s, see D10). So the invocation for the minute in which it
  becomes eligible always sees it as pending when that invocation starts.
- **Latency:** about 1 s polling, plus EventBridge start jitter of a few
  seconds. This stays within the spec's 10 s bound.
- **Overlapping invocations** are harmless, because settlement is idempotent
  (D5). The Lambda timeout is about 75 s.
- **Entry point:** a single pass, `runSettlementPass(now)`, is the unit that
  is exercised. The Lambda handler loops over it. The local dev server calls it
  on an interval.

**Alternatives considered:**

- **SQS delay queue per prediction:** saving the prediction and sending the
  message are two separate writes. A failed send leaves a prediction that never
  settles unless something sweeps it up.
- **Step Functions per prediction:** precise, but the same two-write problem,
  and more IAM and infrastructure.
- **EventBridge Scheduler one-time schedules:** only 60 s precision.
- **Lazy settlement on read:** unfair, as described in Context.

### D4. Persistence: one DynamoDB table, one item per player

The table is `players` (on-demand billing, point-in-time recovery enabled), with
partition key `playerId`.

| Attribute | Notes |
|---|---|
| `playerId` | `crypto.randomUUID()`; also the bearer credential |
| `displayName`, `createdAt` (epoch ms) | |
| `score`, `wins`, `losses`, `currentStreak`, `bestStreak` | numbers |
| `activePrediction` | map `{id, direction, entryPriceCents, createdAt, eligibleAt}`; absent when none |
| `lastResult` | map: the prediction fields plus `status`, `settlementPriceCents`, `settledAt`, `scoreBefore`, `scoreAfter` |
| `pendingKey` = `"PENDING"`, `pendingEligibleAt` | present only while a prediction is active (sparse GSI `pending`) |
| `lbKey` = `"LB"`, `scoreRankKey`, `accuracyRankKey` | present only once games played ≥ 1 (sparse GSIs `score-lb`, `accuracy-lb`) |

**Invariants are enforced by single-item conditional writes:**

- **Create player:** `PutItem` with condition `attribute_not_exists(playerId)`.
- **Create prediction:** `UpdateItem` that sets `activePrediction` and the
  pending keys, with condition
  `attribute_exists(playerId) AND attribute_not_exists(activePrediction)`.
  If two requests race, exactly one passes the condition. The loser gets a
  `ConditionalCheckFailed` error, which maps to `409`.
- **Settle:**
  1. Read the item with a strongly consistent read.
  2. Compute the outcome and the new statistics with the pure domain functions.
  3. Write with `UpdateItem`, condition
     `activePrediction.id = :predictionId`. The write sets the new statistics,
     sets `lastResult`, sets the rank keys and `lbKey`, and removes
     `activePrediction` and the pending keys.

  Statistics change only when the active prediction settles. So if the
  condition holds, the statistics read in step 1 are still current. A duplicate
  or concurrent attempt fails the condition and has no effect. This gives
  exactly-once settlement without transactions.
- **Rename:** `UpdateItem SET displayName`, with condition
  `attribute_exists(playerId)`. It never touches statistics, so it cannot
  conflict with settlement.

**Leaderboards** are a `Query` on a GSI (`lbKey = "LB"`, descending, `Limit` N)
with projection INCLUDE `displayName`, `score`, `wins`, `losses`, `createdAt`.
Rank keys are fixed-width strings whose lexicographic order equals the spec's
ordering:

- `scoreRankKey` = pad(score + 10^12) | pad(adjusted accuracy scaled) |
  pad(gamesPlayed) | pad(MAX_TS − createdAt).
- `accuracyRankKey` = pad(adjusted accuracy scaled) | pad(gamesPlayed) |
  pad(MAX_TS − createdAt).
- "Adjusted accuracy scaled" is `floor((wins+5)·10^15 / (games+10))`, computed
  with BigInt. Equal fractions give equal keys, and distinct fractions give
  distinct keys for any realistic game count (below about 3·10^7).
- The ordering itself is defined once, as comparators in the domain module
  (D6). The rank-key encoders are tested against those comparators so the two
  cannot drift apart.

**Alternatives considered:**

- **Scan the table and sort:** cost grows linearly with every anonymous
  visitor.
- **Aurora Serverless / Postgres:** needs a VPC, has slow resume from idle and
  needs connection handling.
- **Separate predictions table with transactions:** only buys history, which
  is a non-goal.

### D5. Money as integer cents; one comparison rule

- Provider prices are decimal strings (`"67503.42"`). They are parsed exactly
  into integer cents, without going through floats. BTC-USD uses a 0.01 quote
  increment. If a value ever has more than 2 decimals, it is rounded half-up to
  cents.
- All comparisons (settlement outcome and live status) use cents and one shared
  function. This guarantees that the browser's WINNING/LOSING/TIED and the
  server's won/lost/pending follow the same rule.
- The API exposes USD numbers with 2 decimals (`cents / 100`).

### D6. Shared pure domain module (stable seam #1)

`packages/shared/src/domain.ts` (`@btc/shared/domain`) holds every business rule as a pure function, with no I/O
and no clock access (time is passed in). Its public surface is the stable seam
for `tests/acceptance/`:

| Function | Contract |
|---|---|
| `evaluateSettlement(prediction, priceCents, now)` | → `"won" \| "lost" \| "pending"` (pending if `now < eligibleAt` or tie) |
| `applyOutcome(stats, "won" \| "lost")` | → new `{score, wins, losses, currentStreak, bestStreak}` |
| `deriveStats(stats)` | → `{gamesPlayed, accuracy: number \| null, adjustedAccuracy}` |
| `liveStatus(direction, entryCents, liveCents)` | → `"winning" \| "losing" \| "tied"` |
| `compareScoreRank(a, b)`, `comparePredictorRank(a, b)` | Array.sort comparators implementing the leaderboard ordering |
| `validateDisplayName(input, maxLength)` | → `{ok: true, value}` (trimmed) or `{ok: false, reason}` |
| `parsePriceToCents(text)` | → integer cents, or `null` for an invalid or non-positive price |
| `PREDICTION_WINDOW_MS = 60_000` | default and minimum prediction window; the configured window (D10) is applied by the API when a prediction is created |

Ranking inputs include `createdAt`. Only the names and contracts above are
fixed; internal helpers are free.

### D7. HTTP API contract (stable seam #2)

- All routes are under `/api` and use JSON.
- The player credential is sent as `Authorization: Bearer <playerId>`.
- Every response includes `serverTime` (ISO-8601 UTC, ms precision), which the
  client uses to compute its clock offset.
- Errors have the shape `{ "error": { "code", "message" } }`.

| Method & path | Request | Success | Errors |
|---|---|---|---|
| `POST /api/players` | none | `201 {playerId, player, serverTime}` | — |
| `GET /api/me` | bearer | `200 {player, activePrediction \| null, lastResult \| null, serverTime}` | `401 unauthorized` |
| `PATCH /api/me` | bearer, `{displayName}` | `200 {player, serverTime}` | `400 validation_failed` (`message` explains the problem, e.g. the max length), `401` |
| `POST /api/me/predictions` | bearer, `{direction: "up" \| "down"}`; other fields are ignored | `201 {prediction, serverTime}` | `400 invalid_request`, `401`, `409 prediction_already_active`, `503 price_unavailable` (retryable) |
| `GET /api/leaderboards` | optional bearer | `200 {score: {entries}, predictor: {entries}, serverTime}` | — |

**Representations:**

- `player`:
  `{displayName, score, wins, losses, gamesPlayed, accuracy, adjustedAccuracy, currentStreak, bestStreak}`.
  `accuracy` is a 0–1 value or `null`. No `playerId` is included, except in the
  creation response.
- `prediction`:
  `{id, direction, entryPrice, createdAt, eligibleAt, status, settlementPrice?, settledAt?}`.
- `lastResult`: a settled `prediction` plus `{scoreDelta, scoreBefore, scoreAfter}`.
- Score entry: `{position, displayName, score, isCurrentPlayer}`.
- Predictor entry:
  `{position, displayName, adjustedAccuracy, accuracy, gamesPlayed, isCurrentPlayer}`.
- No entry ever contains a `playerId`.

**Behaviour:**

- Any unexpected failure → `500 internal_error`, logged.
- The client handles the cases as follows:
  - `401` on startup → create a new player.
  - `409` → re-fetch `/api/me`.
  - `503` or a network error → re-fetch `/api/me`, then show a retryable
    error. If that re-fetch fails too after a network error or a `409`, a
    prediction may exist that the page cannot see: UP/DOWN stay blocked, with a
    "Check again" button, until a read succeeds.
  - Every request (including `config.json`) has a 15 s limit, body included.
    That is above the API Lambda's 10 s timeout plus a cold start, so it only
    cuts off answers that are not coming (e.g. a stalled connection). Reaching
    it counts as a network error, so a stalled prediction request is
    reconciled like any other unknown outcome.
  - Responses may arrive out of order: a read is shown only if it started
    after the state currently on screen, and a prediction or rename response
    always beats reads that were in flight when it arrived.

### D8. Settlement seam for tests (stable seam #3)

`@btc/server/settlement` (`apps/server/src/features/settlement/settlement.ts`) exports
`runSettlementPass(now: Date): Promise<void>`.

- It uses the configured table and market REST URL.
- Contract tests create predictions through HTTP. They then call it with an
  explicit `now` (for example created + 59.999 s, or + 60 s) against a stub
  market server whose price and failure mode the test controls. This exercises
  timing, ties, outages and idempotency without waiting in real time.

### D9. Frontend structure

- React + Vite + TypeScript, with plain CSS (custom properties).
- No global store, router or data-fetching library.
- **Two independent state sources, each owned in one place:**
  - **Market feed:**
    - a Coinbase WebSocket subscribed to `ticker` for `BTC-USD`;
    - parses with `parsePriceToCents`;
    - tracks the last valid update time to decide staleness;
    - holds a rolling buffer of observations sampled at most once per second
      for the chart;
    - reconnects with exponential backoff (1 s doubling to 30 s max);
    - closes a connection that stays open without a valid price for the stale
      threshold (a dead connection after sleep or a network change sends no
      close event; a rejected subscription sends no prices), so the same
      backoff reconnects it;
    - batches high-frequency ticks to one render per animation frame.
  - **Game/player state:** loaded from `/api/me`.
    - Polling happens only while `Resolving…`, every 2 s by default.
    - Re-fetched after mutations, on `409`, and when the tab becomes visible
      again.
- **Derived values (not stored):**
  - countdown = `eligibleAt − (Date.now() + serverOffset)`, clamped at 0;
  - live status uses `liveStatus()`;
  - "Score 6 → 7" comes from `lastResult.scoreBefore` and `scoreAfter`.
- **Chart: Recharts**, chosen so the chart is easier to maintain and extend
  later.
  - **Data:** a `LineChart` over the sampled observation buffer (at most one
    point per second), plus a live end point at the displayed price (D13).
  - **Entry price:** a `ReferenceLine` at the entry price, dashed and labelled
    with the formatted price, so it is distinguishable by more than colour.
  - **Recharts tweening:** off (`isAnimationActive={false}`). Smooth movement
    comes from moving the time window every frame (D13), never from morphing
    the line between data sets.
  - **Layout:** the chart sits inside a fixed-height container, so resizing
    never shifts the layout.
  - **Accessibility:** a wrapping `figure` carries the `aria-label` summary
    (time window and latest price). The chart is not the only source of any
    information.
  - **Price text:** prices use tabular numerals so the layout stays stable.

  **Alternatives considered:**

  - **Lightweight Charts:** made for price charts and smaller, but it is
    controlled through code rather than React components, uses a canvas
    (weaker accessibility) and requires attributing TradingView.
  - **uPlot:** too low-level; the entry line would need custom drawing code.
  - **Hand-drawn SVG:** smallest, but more code to maintain later.
- **Accessibility:** one polite live region for the announcement list in the
  spec. Native `<button>` and `<form>` elements throughout. Disabled reasons
  are shown as visible text, referenced with `aria-describedby`.

### D10. Configuration: one source in Terraform, delivered at runtime

Everything is a Terraform variable. The prediction window
(`PREDICTION_WINDOW_SECONDS`) is applied only when a prediction is created: the
stored `eligibleAt` stays authoritative, so changing the setting never affects
predictions that already exist. Values below 60 are rejected, because the
once-a-minute settler (D3) relies on every prediction being created at least
60 s before it becomes eligible.

**Delivery:**

- **Server values:** become Lambda environment variables.
- **Browser values:**
  - Terraform writes them into `config.json` (an `aws_s3_object` with
    `jsonencode`).
  - The SPA fetches it at startup with `Cache-Control: no-cache`.
  - Locally, the dev server serves `config.json` from the same environment
    variables.
- **Consequences:**
  - The web build artifact does not depend on the environment.
  - Shared values, such as the maximum name length, have one source and cannot
    drift.
- **Validation:** configuration is checked at start-up. An invalid value fails
  fast (Lambda init error, or the SPA shows a configuration error) instead of
  silently falling back to a default.
- **Bounded values:** `PREDICTION_WINDOW_SECONDS` has a minimum of 60, and
  `CHART_WINDOW_SECONDS` is limited to 60–600. Bounds are enforced where the
  value is set: the shared `loadConfig` (local server, Lambdas, and the local
  `config.json`) and a matching Terraform variable validation (the deployed
  `config.json`). The SPA keeps its generic check (a positive number) and does
  not repeat the bounds, because every `config.json` comes from a validated
  source.

| Variable | Default | Used by |
|---|---|---|
| `NAME_MAX_LENGTH` | 24 | API, web |
| `LEADERBOARD_SIZE` | 10 | API |
| `MARKET_PRODUCT_ID` | `BTC-USD` | API, settler, web |
| `MARKET_REST_URL` | `https://api.exchange.coinbase.com` | API, settler |
| `MARKET_WS_URL` | `wss://ws-feed.exchange.coinbase.com` | web |
| `MARKET_TIMEOUT_MS` | 3000 | API, settler |
| `SETTLEMENT_POLL_INTERVAL_MS` | 1000 | settler |
| `STALE_THRESHOLD_MS` | 10000 | web |
| `CHART_WINDOW_SECONDS` | 120 (60 to 600) | web |
| `RESOLVE_POLL_INTERVAL_MS` | 2000 | web |
| `PREDICTION_WINDOW_SECONDS` | 60 (minimum 60) | API, web |
| `TABLE_NAME` | set by Terraform | API, settler |
| `DYNAMODB_ENDPOINT` | unset (AWS) | local / tests only (DynamoDB Local) |

### D11. Repository layout and tooling

A pnpm workspace (monorepo) with three packages. The pnpm version is pinned with
the `packageManager` field, and `pnpm-lock.yaml` is committed. Workspace
packages export their TypeScript sources directly (no build step between them):
Vite, Vitest, tsx and esbuild all compile TypeScript, and Lambda handlers are
bundled with esbuild, so no runtime `node_modules` resolution is needed in
Lambda. Dependency install scripts run only for explicitly approved packages
(e.g. esbuild), per pnpm's build-script policy. The root keeps repo-wide tooling
and the protected suites, whose paths are fixed by the project rules.

```
apps/web/        @btc/web: React SPA (Vite), feature-based
  src/app/         App (config loading) and Game (layout composing the features)
  src/features/    player, market, predictions, progress, leaderboards;
                   each with components/ and hooks/ as needed
  src/components/ui, src/hooks, src/lib (API client, config, formatting),
  src/styles, src/test (setup and test utilities)
apps/server/     @btc/server: Hono API, settler, Lambda handlers, local dev server
  src/features/    players, predictions, leaderboards, settlement
                   (routes, store, views per feature)
  src/http, src/market, src/db (item types, table schema), src/entrypoints
packages/shared/ @btc/shared: domain rules (domain.ts) and configuration (config.ts)
infra/           Terraform root module (S3 backend, partial config)
scripts/         deploy helper
tests/acceptance domain rules (pure)          -- protected
tests/contract   HTTP API + settlement pass    -- protected
e2e/             Playwright, full local stack  -- protected
tests/harness    stubs and the local-stack fixture shared by the suites
tests/integration  implementation-level tests that need the local stack
```

**Tooling:**

- Vitest for unit, acceptance and contract tests.
- Frontend unit tests use React Testing Library in Vitest's jsdom
  environment:
  - packages: `@testing-library/react`, `@testing-library/user-event` and
    `@testing-library/jest-dom` (for matchers such as `toBeDisabled` and
    `toHaveAccessibleDescription`);
  - location: next to the component (`apps/web/src/**/*.test.tsx`), not protected;
  - scope: UI states that are slow, time-dependent or awkward to reach
    end-to-end, such as countdown boundaries, stale and reconnect timing,
    validation, error, empty and loading states, and announcement policy;
  - not tested: chart pixels. Recharts' responsive container measures zero in
    jsdom, so chart tests check the wrapper's states (collecting, summary,
    entry label) with fixed dimensions or a stubbed `ResizeObserver`.
- Playwright, plus `@axe-core/playwright`. The axe dependency is justified
  by the contrast/accessibility scenario in the spec.
- ESLint (typescript-eslint) and `tsc --noEmit`.
- esbuild bundles each Lambda handler. Vite builds the SPA.
- `docker compose` runs DynamoDB Local for contract and e2e tests.

**Local stack used by e2e:**

- DynamoDB Local;
- the local Node server (API + settler loop + `config.json`);
- the Vite preview build;
- a stub market REST server;
- a stub WebSocket server that emits Coinbase-shaped `ticker` messages and
  can go quiet or drop the connection on command.

All of these are pointed at through the configuration above. No test-only
code paths exist in production code.

### D12. Deployment

- **Layout:** a single Terraform root module in `infra/`, with an S3 state
  backend using native lock files. The state bucket is a documented
  prerequisite.
- **Region:** `eu-central-1` by default (a variable).
- **Resources:**
  - S3 bucket (private), CloudFront with OAC and the managed
    security-headers policy;
  - HTTP API;
  - two Lambdas (`nodejs24.x`, arm64) with least-privilege IAM;
  - DynamoDB table and GSIs;
  - EventBridge rule;
  - CloudWatch log groups with retention.
- **Deploy sequence:** `pnpm build` → `terraform apply` (zips the Lambda
  bundles with `archive_file`) → `aws s3 sync apps/web/dist` → CloudFront
  invalidation of `/index.html` and `/config.json`.
- **Logs:** structured JSON for settlement outcomes and provider failures.
- **State backend (one-time bootstrap, outside Terraform):**
  - a dedicated bucket `btc-up-down-tfstate-<account-id>` in `eu-central-1`;
  - versioning on, default encryption (SSE-S3), all public access blocked;
  - created with the AWS CLI, as documented in the README;
  - `infra/backend.hcl` (git-ignored) points at it with key
    `btc-up-down/terraform.tfstate` and `use_lockfile = true`.

  It is not shared with other projects' state, and versioning lets a damaged
  state file be recovered.
- **Region independence:** the deploy script must not inherit the AWS CLI's
  default region, which is invalid on the deploying machine. AWS CLI v1 reads
  `AWS_DEFAULT_REGION` and ignores `AWS_REGION`. Terraform gets a `region`
  output, and the script exports `AWS_DEFAULT_REGION` from it before its `aws`
  calls. Terraform itself already uses `var.region`, and the backend uses the
  region in `backend.hcl`.
- **Provider lock file:** `infra/.terraform.lock.hcl` stays committed (it is
  not git-ignored), so every deploy and rollback resolves the same provider
  versions.
- **Verifying Coinbase reachability through behaviour, not temporary code:**
  - **API Lambda:** `POST /api/me/predictions` answers `201` with an entry
    price, not `503 price_unavailable`.
  - **Settler Lambda:** the same prediction settles within the specified
    bound after `eligibleAt`. `/api/me` shows the result, and the settler's
    log group has a `settled` entry and no `price_unavailable`.

  Both are checked with `curl` and `aws logs`, and the outcome is recorded in
  Risks below. If either fails, deployment work stops and the alternatives (a
  different region or provider URL) go to the owner.
- **Teardown:** `terraform -chdir=infra destroy` removes everything except the
  state bucket. The web bucket has `force_destroy`. The DynamoDB table is
  deleted with its point-in-time-recovery backups, which is acceptable for
  this MVP.
- **Cost:** pay-per-request DynamoDB, Lambda, the HTTP API and CloudFront at
  MVP traffic stay within or near the free tier. The settler runs once a minute
  (about 43,800 invocations a month) and exits at once when nothing is due.
  Expect well under a few dollars a month. The README states this.

### D13. Chart motion and status transitions

**Problem.** The chart's time window moved forward once a second (`useTick(1000)`),
so the whole line jumped left in steps. The price range was recomputed from the
visible minimum and maximum with unrounded padding, so every new extreme
rescaled the chart and changed the axis labels. The end of the line was the last
one-per-second sample, so it lagged behind the headline price by up to a second.

**Approach (all inside the chart component; no new dependency):**

- **Frame clock.** While motion is allowed, the chart's `now` comes from
  `requestAnimationFrame`. Under `prefers-reduced-motion: reduce` (read with
  `matchMedia` and followed when it changes) it falls back to the existing
  one-second tick. Browsers pause animation frames in hidden tabs, so a
  background tab costs nothing, and the chart shows the current window as soon
  as the tab is visible again.
- **Time axis.** The domain is `[now − window, now]`. Ticks are at round clock
  times (a step that gives at most 5 labels for the configured window, e.g. every
  30 s for the default 2 minutes, every minute for 5 minutes). Recharts keys its ticks by pixel position, so with a
  window that moves every frame it would destroy and re-create every label
  every frame. The labels are therefore a small SVG overlay on the plot's
  bottom strip, with one element per tick keyed by its time, positioned in
  percent of the plot width. Recharts draws only the line, the grid, the price
  axis and the axis line. The plot geometry (price axis width, right margin,
  axis height) is shared as constants between the two.
- **Live end point.** While the feed is fresh, the plotted data is the sampled
  observations plus `{ t: now, price: displayed price }`. While it is stale,
  there is no end point, so the line stops at the last observation (no invented
  data). The chart therefore needs the feed's latest price, the time it was
  received, and freshness as inputs. The accessible summary uses the same latest
  price. "Collecting recent price data" is still decided by the sampled
  observations (at least two inside the window), not by this extra end point.
- **Price axis.** The range is computed from the visible prices, the end point
  and the entry price (if any), together with the range from the previous frame
  (kept in a ref):
  - the step is the smallest 1, 2 or 5 × 10ⁿ dollars (at least $1) that gives
    no more than about 5 labels;
  - the bounds snap outward to multiples of the step;
  - the range expands as soon as a value would fall outside it, and contracts
    only when the values fill less than half of it;
  - the minimum span is 2 steps, centred on the price, so a flat line sits
    inside the chart.

  Ticks are passed explicitly. Rescaling is instant: it is rare once there is
  hysteresis, and animating it would mean animating the axis too. This is a
  pure calculation (`features/market/lib/chartModel.ts`, with unit tests).
- **Rendering cost.** Only the chart re-renders every frame. It is memoised, and
  its parent does not re-render per frame. Each frame filters at most a few
  hundred points.

**Status transitions (CSS only):**

- `.status` transitions `color` and `background-color` over about 200 ms. The
  text changes immediately.
- `.result` plays a one-time keyframe when it mounts: `opacity 0→1` and
  `translateY(4px→0)` over about 250 ms. Only opacity and transform change, so
  layout never moves.
- One `@media (prefers-reduced-motion: reduce)` block sets these transitions
  and animations to `none`.
- The price text gets no animation at all (see Non-goals in the proposal).

**Alternatives considered:**

- **Render at 1 Hz and slide the plot with a CSS transform.** This is
  compositor-cheap, but the axes and the clip region would have to slide
  separately from Recharts' layout, which is fragile.
- **Recharts' built-in animation.** It tweens between data sets, which
  produces the wobble we want to avoid. It does not scroll.
- **Hand-drawn SVG path or a canvas library.** This is the fallback only if the
  performance check below fails. That would be a separate decision, raised
  with the owner first.

**Verification.**

- e2e:
  - frame-rate redraws of the chart;
  - the line's end matches the displayed price;
  - stable price-axis labels;
  - time labels that slide;
  - no running animations under reduced motion;
  - no layout movement.
- Unit tests for the range rules (expansion, the contraction threshold,
  minimum span, step selection).
- A manual performance check: Chrome Performance panel at 4× CPU slowdown,
  plus a real phone. Chart work must fit within the frame (no long tasks, and
  no dropped-frame streaks while idle on the game screen).

### D14. How-to-play dialog

- **Native `<dialog>` opened with `showModal()`.** The browser provides:
  - the top layer and `::backdrop`;
  - an inert background (no pointer or keyboard access);
  - focus contained in the dialog;
  - Escape closing it (`cancel`/`close` events).

  No dependency and no custom focus trap. React state (`open`) drives
  `showModal()`/`close()` in an effect. The `close` event keeps that state in
  sync when Escape closes the dialog.
- **Where it lives:** a small `features/instructions/` folder (dialog
  component plus the preference read/write). `Game` owns the `open` state
  and renders the "How to play" button in the header next to the name
  editor. The dialog belongs to the game screen only, so it can never appear
  on the loading, error or configuration-error screens.
- **Opening on load:** `Game` reads the preference once, when it mounts. The
  dialog opens in the same render in which the game screen first appears, so
  it is never a separate, later step that tests or players have to wait for.
  At most once per page load: retrying after an error does not reopen it.
- **Preference:** one `localStorage` key, separate from the player identifier
  (for example `btc-up-down.hideInstructions` = `"true"`). It is read and
  written inside `try/catch`. If storage fails, the read means "show" and the
  write is ignored, so the player sees no error. The checkbox is controlled
  by the stored value and writes on every change, so there is no "save on
  close" rule and no state is lost when the player reloads with the dialog
  open. It is never sent to the API.
- **Rendered only while open:** the `<dialog>` element is always mounted, but
  its content is rendered only while `open` is true. Closed content would
  stay in the page as hidden text, and the protected e2e tests match text
  page-wide (for example `/UP/i`, `/DOWN/i`), which counts hidden elements.
- **Focus containment:** a modal dialog makes the page inert, but Tab at its
  last control still leaves for the browser UI. A small `keydown` handler wraps
  Tab and Shift+Tab between the first and last tabbable controls. The scrollable
  text area is itself focusable (`tabIndex=0`), so keyboard users can scroll it
  on small screens. This is the one justified lint suppression.
- **Focus:** when the dialog opens, focus goes to "Got it" (`autoFocus`), the
  expected action. On close, by any means, focus is moved explicitly to the
  "How to play" button through a ref. This also covers the automatic open,
  where there was no previously focused element to return to.
- **Content:** static JSX with one configured value, the prediction window
  formatted by the existing `formatDuration` ("1 minute", "90 seconds"). The
  wording follows the spec's list of facts. It does not state the
  leaderboard size, which is a server-only setting.
- **Layout:**
  - `width: min(32rem, 100% − 2rem)` and `max-height: calc(100dvh − 2rem)`,
    with the content scrolling inside;
  - the checkbox and "Got it" in a footer that stays visible;
  - existing colour tokens and focus styles;
  - no animation, so the motion rules are met trivially.
- **Effect on protected e2e tests (approved by the owner):** every test starts
  in a fresh browser context, so the dialog opens on every first load. The
  shared open/reload helpers in `e2e/` dismiss it through the UI, as a player
  would: they check "Don't show again" and choose "Got it". No assertion
  changes. Later pages in the same context (reload, a second tab, a reopened
  page) then load without it, which is the specified behaviour.

**Alternatives considered:**

- **A custom `div role="dialog"` with a hand-written focus trap:** more code
  and easier to get wrong than the native element.
- **A dialog library:** a new dependency for one dialog.
- **A dismissible inline panel instead of a modal:** it would not change the
  protected tests, but it is not what was asked for, and it competes with the
  game for space on small screens.

## Risks / Trade-offs

- **The deploy runs with the AWS account root user's access keys** (the
  owner's decision for this MVP). A leaked root key means full account
  compromise, and root actions cannot be limited by IAM policy.
  → Accepted for the first deploy. Recommended next step, outside the MVP:
  a least-privilege deploy user or SSO role, and deleting the root access
  keys.

- **The instructions drift from the rules.**
  → The only configurable value in them (the window) comes from
  configuration, and e2e checks the key facts. Any later rule change has to
  update the dialog in the same change.
- **Returning players see the dialog on every load until they opt out.**
  → This is the requested behaviour. The checkbox is next to "Got it", so
  opting out takes one extra click.

- **Redrawing the chart every frame costs CPU on low-end phones.**
  → Only the chart re-renders, and hidden tabs pause automatically. D13
  defines a manual performance check. If Recharts cannot meet it, stop and
  raise it (lower frame cap or hand-drawn SVG) rather than silently shipping
  a stuttering chart.
  → **Verified manually by the owner (2026-10-08, task 15.4):** the owner
  reported that all four checks pass: Chrome Performance panel at 4× CPU
  slowdown, a real phone, the result card fading in without moving other
  elements, and the OS reduced-motion setting.

- **Coinbase rejects or rate-limits requests from AWS Lambda IPs.**
  → Verify reachability from a deployed Lambda early (walking-skeleton task).
  Failures are honest anyway: creation returns `503` and settlement stays
  `Resolving…`. The provider URL is configurable.
  → **Verified on the deployed stack (2026-10-08, `eu-central-1`): not blocked.**
  The API Lambda created an UP prediction (`201`, entry price from Coinbase,
  no `503`). The settler Lambda settled it 0.3 s after `eligibleAt` (win,
  +1), logged one `settled` entry and no `price_unavailable`, and the API log
  group had no errors. The plain REST ticker works from both Lambdas, so no
  change of region or provider URL is needed.
- **The live WINNING status and the server result disagree near a tie.** The
  browser stream and the server REST fetch sample the same exchange at
  different instants.
  → The spec defines live status as informational. The UI words it as live
  feedback, and the result always shows the authoritative settlement price.
- **Settlement latency depends on EventBridge start jitter.**
  → Bounded by the spec at 10 s. `Resolving…` is honest in the meantime.
- **The settler is a Lambda that loops for up to a minute** (unusual
  pattern).
  → Documented here and in the README. Idle invocations exit immediately. The
  worst-case cost (continuous play) is about 324k GB-s per month, within the
  free tier.
- **GSIs are eventually consistent.** A leaderboard reloaded right after
  settlement may lag by about a second.
  → Acceptable for a non-realtime leaderboard. The player's own statistics
  come from a strongly consistent read.
- **Constant GSI partition keys cap write throughput** at roughly 1,000
  updates/s.
  → Orders of magnitude above MVP needs. Write sharding is intentionally
  omitted.
- **Anyone can create unlimited anonymous players** (table growth, leaderboard
  gaming).
  → Accepted as a non-goal. Platform default throttling applies.
- **Clearing browser storage loses the player.**
  → Inherent to anonymous identity. Accepted.
- **Players' results are not kept beyond the last one.**
  → Accepted product decision. History can be added later as separate items
  without migrating existing data.
- **Single region, no CI/CD.**
  → Manual `terraform apply` plus a deploy script. Rollback means
  re-deploying the previous build. Data is protected by point-in-time
  recovery.

## Migration Plan

Greenfield, so there is nothing to migrate.

1. Bootstrap the Terraform state bucket (documented prerequisite).
2. Run the deploy sequence (D12).
3. Run the deployed smoke checklist from tasks.md.

## Open Questions

- AWS account, region and state-bucket names. These are deploy-time inputs and
  do not affect the design.
