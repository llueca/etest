# Test harness

Shared utilities for the behavioural suites. Not itself a behavioural suite.

Prerequisite: `pnpm db:up` (DynamoDB Local on 127.0.0.1:8100).

| Utility | Use |
|---|---|
| `stack.ts` → `startStack(options?)` | Contract tests. Starts a stub market, a fresh DynamoDB table and the production API on an ephemeral port. Sets `process.env` (TABLE_NAME, MARKET_REST_URL, DYNAMODB_ENDPOINT, ...) while running, so `runSettlementPass(now)` uses the same table and market. `stack.baseUrl` is the API origin; `stack.market` controls the stub; `stack.stop()` tears down. |
| `stub-market.ts` → `StubMarket` | Controls price (`setPrice("67500.00")`), REST delay and failure (`restFailure: "error" \| "hang"`), WebSocket silence (`silent`), dropped connections (`drop`), refused reconnects (`refuseConnections`), raw messages (`emitRaw`), `emitTick()`, and `restRequests`. |
| `stub-market.ts` → `StubMarketControl` | Same control over HTTP, for Playwright tests (the stack runs in another process). `new StubMarketControl("http://127.0.0.1:4174/__control")`; call `reset()` before each test. |
| `serve-stack.ts` | Playwright `webServer`: built SPA (`apps/web/dist`) + API + stub market on app port 4173, market port 4174. `*_MS` environment variables are passed through (e.g. `STALE_THRESHOLD_MS=2000`). |

The stub speaks Coinbase's wire shapes: REST `GET /products/BTC-USD/ticker`
(`{price: "67500.00", ...}`) and WebSocket `/ws` (`subscribe` →
`subscriptions`, then `ticker` messages).
