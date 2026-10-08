# Protected-test discrepancies (RESOLVED)

**Resolution:** the project owner authorised `behaviour-test-author` to fix the three test defects
below (changes limited to `e2e/bitcoin-up-down.spec.ts`; assertions kept equivalent: wait for the
prediction before moving the price; assert one `You` per leaderboard; scope the validation
locator to `getByRole("alert")`). `protected-checksums.txt` was regenerated after that change.
A fourth issue appeared once the real-time test could pass: all e2e tests shared one table, so the
settled player made the later "leaderboards empty" test fail. That was a harness problem, fixed in
`tests/harness` (`StubMarketControl.reset()` also empties the players table, which the suite already
calls in `beforeEach`), with a harness self-test; no assertion changed. Result: `pnpm test:e2e` 25/25.

Found while making `e2e/` green. The protected tests were **not** modified, and the product
was **not** bent to satisfy them. Each item needs an explicit decision: fix the test (by its
author) or amend the spec.

Result at the time of discovery: 23 of 25 e2e tests passing, 2 failing for the reasons below. All other protected suites are green (acceptance 60/60, contract 23/23).

## 1. Race in `predictions › shows UP winning one cent above entry and live status unavailable when stale` (e2e line 243)

```ts
await placePrediction(page, "UP");          // click() returns before the POST reaches the server
await market.setPrice("67500.01");           // stub price moves immediately
await expect(page.getByText("WINNING", { exact: true })).toBeVisible();
```

- The server fetches the entry price when it handles the request (spec: "the server SHALL set
  the entry price from the authoritative provider"). The test moves the stub price within a few
  milliseconds of the click, so the server records an entry price of $67,500.01.
- Page snapshot at failure: `Entry price: $67,500.01`, live price `$67,500.01`, status `TIED`.
  `TIED` is the correct answer for equal prices (spec: live status compares at cent precision).
- Not a spec conflict: the test never waits for the prediction to exist. The sibling test
  (line 221) does wait (`await expect(page.getByText(/DOWN/i)).toBeVisible()`) and passes.
- Suggested fix in the test: wait for the active prediction (e.g. `getByText(/UP/i)` visible)
  before calling `market.setPrice("67500.01")`.

## 2. Strict-mode collision on `getByText("You", { exact: true })` (e2e line 330, real-time flow)

- Spec (leaderboards, "Current player is identifiable"): "On each leaderboard, the current
  player's row SHALL be marked with a visible text label". After one settled prediction the
  player is eligible on **both** boards, so two `You` labels are correct.
- Playwright strict mode rejects a locator that resolves to two elements:
  `strict mode violation: getByText('You', { exact: true }) resolved to 2 elements`.
- Every earlier assertion in that test passes (`WIN`, `$67,500.00 → $67,540.00`, `+1`,
  `Score: 0 → 1`, games played, wins). The assertion on line 331 (live region contains `WIN`)
  is not reached; the same behaviour is covered by `src/Game.test.tsx`.
- Suggested fix in the test: `getByText("You", { exact: true })` → expect a count of 2, or scope
  it to one board (`getByRole("region", { name: "Score leaderboard" })`).

## Minor note (not a failure today)

`e2e` "keeps invalid name text…" matches `/24|maximum|too long|characters/i` against the whole
page. The generated name `Player-NNNN` contains "24" in roughly 3% of cases, which would make
that locator match two elements. Scoping the locator to the alert (`getByRole("alert")`) removes
the flake.

## How-to-play requirements (task 17.2)

No discrepancy between the approved game-instructions spec and the e2e
scenarios was found. The cross-tab scenario uses a second page in the same
Playwright browser context, which shares this browser's preference as required.
The 90-second copy variant is omitted from e2e because the local-stack harness
only passes `*_MS` environment variables and Playwright runs a single server;
it is left to RTL as task 17.3 specifies. Error/configuration screens and
storage-unavailable behaviour are also RTL-only. These are test-scope and
harness limitations, not spec ambiguities.
