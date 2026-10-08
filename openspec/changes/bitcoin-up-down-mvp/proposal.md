# Proposal: Bitcoin Up/Down MVP

## Why

Players need a quick, game-like way to guess whether BTC/USD will be higher or
lower after at least 60 seconds, with live feedback while they wait. Scoring
must be trustworthy: the backend sets the entry price, settles predictions and
scores them, regardless of what the browser does. The repository is greenfield,
so this change delivers the complete first product.

## Core MVP outcome

An anonymous player opens the app and sees the live BTC/USD price and chart.
They predict UP or DOWN and watch a server-anchored countdown, with
WINNING/LOSING/TIED feedback against their entry price. They then receive a
fair, server-settled +1/-1 result. Score, statistics, streaks and any active
prediction survive closing the browser. Two Top-10 leaderboards (raw score and
adjusted accuracy) make the game competitive. The product is deployed on AWS.

## What Changes

### Required for a complete MVP (all of brief US-01 to US-30)

- Anonymous player creation with a locally persisted opaque identifier, a
  generated display name and full state restoration. Display names can be
  edited.
- Live BTC/USD price and a rolling chart, fed directly from the public
  Coinbase Exchange feed in the browser, with explicit stale and reconnecting
  states.
- UP/DOWN predictions. The server captures the authoritative entry price and
  timestamps. The backend enforces at most one active prediction per player,
  including under concurrent requests.
- A countdown derived from the server's `eligibleAt`, a "Resolving…" state,
  informational WINNING/LOSING/TIED status and an entry-price marker on the
  chart.
- Background server-side settlement that runs whether or not the browser is
  open:
  - never earlier than the prediction window (60 s by default);
  - stays pending on an exact price tie;
  - stays pending while the authoritative provider is unavailable;
  - applied exactly once.
- Score, wins, losses and streak accounting. Result feedback shows the
  direction, the entry → settlement price, the ±1 change and the score
  before → after. Player statistics include accuracy.
- A score leaderboard and an adjusted-accuracy ("predictor") leaderboard,
  each Top 10. Both exclude players with no settled predictions and highlight
  the current player.
- Retryable error handling for prediction creation. Settlement delays are shown
  honestly. Live-feed recovery leaves the game state untouched.
- Responsive layout at 375 / 768 / 1280 px. The game works with a keyboard and
  assistive technology.
- Deployment as a static SPA (S3 + CloudFront) and a serverless backend
  (API Gateway HTTP API + Lambda on Node.js, DynamoDB, a scheduled settler),
  defined in Terraform.
- Operational defaults are configurable through environment variables: name
  length, stale threshold, chart window, leaderboard size, provider endpoints,
  timeouts, the settlement polling interval and the prediction window (default
  60 s; never shorter than 60 s, which keeps the scheduled settler's timing
  guarantee).

### High-value small improvements (in scope; small cost, large effect)

- Responses include the server's current time, so countdowns stay correct even
  when the device clock is off.
- If a prediction request is rejected because one is already active (e.g. from
  another tab), the UI re-syncs to the server state instead of only showing an
  error.
- UP/DOWN are disabled while a request is in flight, which prevents accidental
  double submits.
- The last result stays visible until the next prediction, with no extra
  "dismiss" step.

### Motion polish (change request, replaces the former optional polish)

The first version's chart moved in one-second jumps, and its price scale
jumped whenever a new high or low arrived. That made the product feel
low-quality, so motion is now a requirement:

- The chart moves continuously with time. The line ends at the displayed
  price, and the price scale stays steady, with round labels that change only
  when needed.
- Brief transitions (≤ 300 ms) for WINNING/LOSING/TIED changes and the result
  reveal. They never move the layout or hide text.
- All of it is reduced or off under the reduced-motion preference, and it is
  never the only way state is communicated.

Deliberately not built:

- Flashing or pulsing the price on each tick. At Coinbase tick rates (often
  several per second) it becomes constant flicker, which is the cheap feel this
  change removes. The moving end of the chart line shows ticks instead.
- Tweening the line between data sets (wobble), animated rescaling of the price
  axis, and countdown animations.

### Chart window: 2 minutes by default (change request)

With a 5-minute window the line crawls: a 60-second prediction fills only a
fifth of the chart, so it looks almost still. The chart window was already a
deployment setting (`CHART_WINDOW_SECONDS`).

- **Required:** the default becomes 2 minutes. A whole prediction then fills
  half the chart, with a minute of context before it, and the line moves 2.5×
  faster across the screen. The chart also fills from empty in 2 minutes
  instead of 5.
- **High-value small improvement:** the setting is bounded to 60 seconds to 10
  minutes and rejected at start-up outside that range. Below 60 s a whole
  prediction does not fit, and below 2 s the chart could never draw a line.
  Above 10 minutes, redrawing the chart every frame (design D13) would handle
  more than 600 points per frame.
- **Outside the MVP:** a player-facing control for the window (for example
  1/2/5 minutes) and remembering a player's choice. One well-chosen default
  serves the game; a control adds UI, persistence and accessibility work for
  little gain.

### How-to-play instructions (change request)

New players face real rules that the screen alone does not explain. The entry
price comes from the server, ties wait for a different price, scoring is
+1/−1, settlement happens even with the page closed, and the predictor board
uses adjusted accuracy. Without an explanation, the first result can feel
arbitrary.

- **Required:**
  - a modal "How to play" dialog that is open when the game screen appears;
  - a "Don't show again" checkbox, remembered in this browser;
  - a "How to play" button that is always available and reopens the dialog;
  - content that matches the real rules and the configured prediction window;
  - a keyboard-accessible dialog: the background is blocked, Escape closes
    it, focus returns to the "How to play" button, and it fits a 375 px
    screen.
- **High-value small improvements:**
  - the checkbox always shows the saved choice, so a player who opted out can
    opt back in from the same dialog, with no separate settings screen;
  - the window length comes from configuration, so the instructions never
    contradict the game.
- **Outside the MVP:**
  - guided tours, tooltips or coach marks;
  - multi-page tutorials;
  - storing the preference with the player on the server, or across browsers;
  - showing the instructions again when they change (versioning);
  - opening animations;
  - closing by clicking the backdrop (the "Got it" button and Escape are
    enough).

### First deployment and Coinbase reachability (change request)

The product promise includes "deployed on AWS", but nothing has been deployed
yet. The Terraform module, deploy script and README deploy section exist, and
`terraform validate` passes. Exploring the target account found three gaps:

- there is no state backend for this project;
- the AWS CLI's configured default region is invalid (`eu-east-1`), which the
  deploy script's `aws s3 sync` would inherit;
- the only credentials are the account root user's.

- **Required:**
  - a dedicated, versioned, encrypted Terraform state bucket, created once
    outside Terraform, and a matching `infra/backend.hcl`;
  - a deploy script that does not depend on the AWS CLI's default region: the
    region comes from the Terraform configuration;
  - a first deploy with `scripts/deploy`, with the plan reviewed before it is
    applied;
  - proof that Coinbase is reachable from both Lambdas. It comes from existing
    behaviour, with no temporary code:
    - the API creates a prediction (`201` with an entry price), not `503`;
    - the settler settles it (a `settled` log entry and the result in
      `/api/me`), not `price_unavailable`;
    - if either is blocked, stop and decide with the owner before going on;
  - the deployed smoke checklist, recorded in the README.
- **High-value small improvements:**
  - a documented teardown (`terraform destroy`; the state bucket is kept) and a
    rough monthly cost, because the deploy runs on a personal account;
  - keeping `infra/.terraform.lock.hcl` committed, so rollbacks and later
    deploys use the same provider versions (it is not git-ignored; the first
    `terraform init` generated it).
- **Outside the MVP:**
  - CI/CD;
  - a custom domain and certificate;
  - alarms and dashboards;
  - WAF or rate limiting;
  - several environments;
  - managing the state bucket in Terraform;
  - creating a least-privilege deploy user or role (recommended next step,
    see design Risks);
  - running the Playwright suite against production (it depends on the stub
    market).

## Non-goals

- Registration, passwords, social login, or moving a player between
  devices/browsers.
- Monetary betting, deposits, withdrawals or chat.
- An application-owned WebSocket or other realtime infrastructure. Leaderboards
  are not streamed in realtime.
- An exact global rank for players outside the Top 10.
- Browsing past games. Only the active prediction and the most recent result
  are stored per player.
- An administration UI, name moderation or profanity filtering.
- Rate limiting beyond platform defaults, and protection against fake or
  multiple accounts.
- Loading past prices into the chart (it starts empty and fills from live data
  after page load).
- A player-selectable chart window. The window is a deployment setting.
- Custom domain, CI/CD pipeline, multi-region and multi-environment
  orchestration.
- A prediction window shorter than 60 seconds. The window is configurable, but
  60 s is both the default and the minimum.

## Capabilities

### New Capabilities

- `player-identity`: anonymous player creation, the local identifier, display
  name changes and restoring player state (US-01–03).
- `live-market-feed`: browser-side live BTC/USD price, rolling chart, staleness
  and reconnection behaviour (US-04, US-05, US-26).
- `predictions`: placing UP/DOWN predictions, the single-active-prediction
  rule, countdown, live WINNING/LOSING/TIED status, entry-price marker and
  creation failures (US-06–11, US-27).
- `prediction-settlement`: authoritative, browser-independent, exactly-once
  settlement, plus score, win/loss and streak accounting (US-12–19, US-23,
  US-28).
- `player-progress`: result feedback and the player statistics summary
  (US-20–22).
- `leaderboards`: the score leaderboard and the adjusted-accuracy leaderboard
  (US-24, US-25).
- `accessible-responsive-ui`: responsive layout and keyboard/assistive-technology
  support across the game (US-29, US-30).
- `game-instructions`: the "How to play" dialog that opens on load, the
  "Don't show again" preference and the "How to play" button (change request).

### Modified Capabilities

None (greenfield).

## Impact

- New code:
  - React + Vite SPA, with Recharts for the live price chart;
  - Node.js 24 Lambda functions (one HTTP API function, one scheduled settler);
  - a local development server that runs the same API and settler code;
  - Terraform for S3, CloudFront, API Gateway, Lambda, DynamoDB and
    EventBridge.
- External dependency: Coinbase Exchange public market data:
  - WebSocket `ticker` channel for the browser;
  - REST ticker for the server.

  No API key is needed.
- Tooling: Node.js and pnpm, Vitest, React Testing Library
  (`@testing-library/react`) for frontend unit tests, Playwright, DynamoDB
  Local (Docker) for persistence-level tests, Terraform.
