# BTC Up/Down

Anonymous players predict whether BTC/USD will be **higher or lower after the prediction window** (60 s by default),
watch a live price and chart, and are scored +1/−1 by the server. Two Top-10 leaderboards rank
players by score and by (adjusted) accuracy.

The product behaviour is specified in
[`openspec/changes/bitcoin-up-down-mvp/`](openspec/changes/bitcoin-up-down-mvp/) (proposal, specs,
design, tasks).

## Architecture

```
Browser (React SPA) ──► CloudFront ──► S3 (private)          index.html, assets, config.json
        │                    └──► /api/* ──► HTTP API ──► API Lambda (Hono) ──► DynamoDB
        │                                                                          ▲
        └── wss ──► Coinbase Exchange (live price)        EventBridge, every minute  │
                                                    └──► settler Lambda ───────────┘
                                                              └── REST ticker ──► Coinbase
```

A pnpm workspace (monorepo). Both apps are organised by feature.

| Package | Contents |
|---|---|
| `apps/web` (`@btc/web`) | React + Vite SPA, plain CSS, Recharts. `src/app` (App, Game layout), `src/features/{player,market,predictions,progress,leaderboards}/{components,hooks}`, `src/components/ui`, `src/hooks`, `src/lib` (API client, config, formatting), `src/test`. No store, router or data-fetching library. |
| `apps/server` (`@btc/server`) | One Hono app (`src/app.ts`) that runs unchanged on Lambda and locally. `src/features/{players,predictions,leaderboards,settlement}` (routes, store, views; settlement pass and loop), `src/http`, `src/market`, `src/db`, `src/entrypoints` (Lambda handlers, local dev server). |
| `packages/shared` (`@btc/shared`) | `domain.ts`: every business rule as pure functions (browser live status and server settlement); `config.ts`: configuration validation. |

The root holds repo-wide tooling (TypeScript, Biome, Vitest, Playwright), `infra/`, `scripts/deploy` and the test suites.
- **`infra/`** Terraform: S3 + CloudFront, HTTP API, two Lambdas, DynamoDB, EventBridge.
- DynamoDB has **one item per player** and three sparse indexes (`pending`, `score-lb`, `accuracy-lb`).
  Every invariant is a single-item conditional write, so there are no locks or transactions.

## How settlement works, and why it is fair

1. The server fetches the **entry price** from Coinbase itself and stamps `createdAt` and
   `eligibleAt = createdAt + window` with its own clock. The browser only sends the direction.
2. A **settler Lambda** runs every minute. While any prediction is due it polls about once a second, fetches **one**
   authoritative price per pass and settles every due prediction with it. It does not depend on the player's browser.
3. A prediction is settled **never before `eligibleAt`**, **never on an exact tie** (it stays pending until a different
   price is observed) and **never without a provider price** (it stays `Resolving…`; nothing is guessed).
4. Settlement is **exactly once**: the write is conditional on the prediction id, so repeated or concurrent attempts change nothing.

Settling when the player next *asks* ("lazy settlement") would let someone watch the market elsewhere and come back only
when it favours them. Settling on the server's schedule removes that option: the price that counts is the first different
price after the minute is up, not the price at the moment the player returns.

The live WINNING/LOSING/TIED status in the browser is informational only; it uses the browser's own price stream, so it can
differ from the server's result near a tie. The result card always shows the authoritative settlement price.

## Configuration

One source: Terraform variables. Server values become Lambda environment variables; browser values are written to
`config.json` in S3 and fetched at startup, so the build does not depend on the environment. Locally, the same names are
read from the environment. Invalid values fail fast (Lambda init error, or a configuration error screen).

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
| `TABLE_NAME` | `players` locally; set by Terraform | API, settler |
| `DYNAMODB_ENDPOINT` | unset (AWS) | local and tests only |

The prediction window applies when a prediction is created: its `eligibleAt` is stored, so changing the setting
never moves existing predictions. Values below 60 s are rejected, because the once-a-minute settler relies on every
prediction being created at least 60 s before it becomes eligible.

The chart window must be 60 s to 600 s. At 60 s a whole prediction fits on the chart, and the 600 s cap limits how
many points the smoothly moving chart redraws every frame. It is a deployment setting, not a player setting.

## Local development

Requirements: Node.js 24+, pnpm (version pinned in `package.json`), Docker.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the e2e tests
pnpm db:up                              # DynamoDB Local on 127.0.0.1:8100
pnpm db:create-table
pnpm dev                                # @btc/server (API + settler loop) on :8787, @btc/web on http://localhost:5273
```

`pnpm dev` talks to the real Coinbase feed. This directory is its own pnpm workspace root (`pnpm-workspace.yaml`), so a
parent workspace is never picked up.

### Tests

| Command | What it runs |
|---|---|
| `pnpm test:unit` | package unit tests, `tests/integration/`, the harness self-tests, and React Testing Library tests (`apps/web/src/**/*.test.{ts,tsx}`) |
| `pnpm test:acceptance` | domain rules, pure (`tests/acceptance/`) |
| `pnpm test:contract` | HTTP API and `runSettlementPass` against DynamoDB Local and a stub market (`tests/contract/`) |
| `pnpm test:e2e` | Playwright against the full local stack (`e2e/`); includes one ~65 s real-time settlement flow |
| `pnpm typecheck`, `pnpm lint` | `tsc --noEmit`, Biome |

The contract and e2e suites need `pnpm db:up`. They run against stubs (`tests/harness/`) that speak Coinbase's wire
format, so no test touches the real exchange. The acceptance, contract and e2e suites are **protected** behavioural
tests, written independently of the implementation; see `openspec/changes/bitcoin-up-down-mvp/red-baseline.md`.

## Deployment

Prerequisites: AWS credentials, the AWS CLI, Terraform ≥ 1.10, and an S3 bucket for Terraform state (created once,
below; not managed by Terraform).

**One-time: create the state bucket** (not managed by Terraform; versioned so a damaged state can be recovered):

```sh
export AWS_DEFAULT_REGION=eu-central-1            # AWS CLI v1 ignores AWS_REGION
BUCKET="btc-up-down-tfstate-$(aws sts get-caller-identity --query Account --output text)"
aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint=eu-central-1
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Then deploy:

```sh
cp infra/backend.hcl.example infra/backend.hcl   # fill in bucket (the one above) / key / region
scripts/deploy                                    # build → terraform apply → s3 sync → CloudFront invalidation
```

Region defaults to `eu-central-1` (variable `region`). The script prints the CloudFront URL.

**Rollback:** check out the previous version and run `scripts/deploy` again. Data is protected by DynamoDB point-in-time
recovery.

**Teardown:** `terraform -chdir=infra destroy` removes everything this module created, including the DynamoDB table and
its point-in-time-recovery backups. The state bucket is kept (it is created outside Terraform). Then empty and delete
that bucket by hand if the project is gone for good.

**Cost:** everything is pay-per-use (on-demand DynamoDB, Lambda, HTTP API, CloudFront, CloudWatch Logs). The settler runs
once a minute, about 43,800 invocations a month, and exits at once when nothing is due. At MVP traffic this stays within
or near the AWS free tier, so expect well under a few dollars a month. This is an estimate, not a measured bill.

### Deployed smoke checklist

Run on 2026-10-08 against the deployed stack (`eu-central-1`, CloudFront URL printed by `scripts/deploy`), with headless
Chromium and `curl`:

| Check | Result |
|---|---|
| App shell, `/config.json` (window 120 s, prediction window 60 s), `GET /api/me` without a token → `401`, `GET /api/leaderboards` → `200` | pass |
| First visit creates a player; the How to play dialog is open; "Don't show again" holds after a reload | pass |
| A reload restores the same player | pass |
| The live price shows and updates; the feed says Live; the chart describes the last 2 minutes | pass |
| An UP prediction placed in the browser settles with the browser closed (settled about 0.3 s after `eligibleAt`) | pass |
| On return, the result card (LOSS, entry → settlement price, −1, `Score: 0 → -1`) and the statistics show | pass |
| Both leaderboards show the player, with the "You" marker | pass |
| Coinbase reachable from both Lambdas: `201` with an entry price from the API, a `settled` log entry and no `price_unavailable` from the settler | pass |

The manual checks on a real phone and the moving chart's performance check (tasks 10.2 and 15.4) were done separately by
the owner on 2026-10-08.

## Deliberate omissions

- No registration, passwords or moving a player between browsers. Clearing browser storage loses the player.
- Only the active prediction and the **most recent result** are stored; there is no history.
- No application-owned WebSocket, queue or cache. Leaderboards are loaded, not streamed, and show no global rank
  outside the top entries.
- No rate limiting beyond platform defaults, and no protection against many anonymous players.
- The chart window is a deployment setting, not a player setting. The instructions' "Don't show again" is kept only
  in the browser, not with the player's server-side progress.
- No CI/CD, custom domain, alarms or multi-region setup. Deploys are manual.
- Leaderboard indexes use a constant partition key (≈1,000 writes/s ceiling), far above MVP needs.
- The settler is a Lambda that loops for up to a minute. Idle invocations exit after a single query.

## Status

Deployed to AWS and verified (see the smoke checklist above). Local suites are green. The manual checks on a real phone
and the chart's performance check at 4× CPU slowdown were done by the owner on 2026-10-08.

The deployed stack matches the current code, including the review follow-ups in `tasks.md` section 18. Checked on
2026-10-08: `terraform plan` reports no changes, CloudFront serves the current web build, and the live API answers
errors with `serverTime` and unknown `/api/*` paths with `404 not_found`.
