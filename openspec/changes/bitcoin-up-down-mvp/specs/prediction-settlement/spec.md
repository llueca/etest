# Spec Delta

## Purpose

Settles every prediction fairly and authoritatively on the server: never before
its prediction window (60 seconds by default) ends, never on a price tie, never twice, and whether or
not the player's browser is open. Applies the resulting score, win/loss and
streak changes.

## ADDED Requirements

### Requirement: Prediction never settles before it is eligible
A pending prediction SHALL NOT be settled before its `eligibleAt`, whatever the current price.

#### Scenario: Winning price before 60 seconds does not settle
- **GIVEN** a pending UP prediction with entry price $67,500.00, created 59.999 seconds ago
- **WHEN** the authoritative price is $67,600.00
- **THEN** the prediction remains pending
- **AND** the score is unchanged

#### Scenario: Matrix - not yet eligible
- **WHEN** settlement is evaluated before eligibleAt for: UP with entry 100 and price 101; DOWN with entry 100 and price 99
- **THEN** each prediction remains pending

### Requirement: Outcome is decided by comparing settlement and entry price
Once eligible, the server SHALL compare the authoritative settlement price S with the entry price E at cent precision:
- UP wins if S > E and loses if S < E;
- DOWN wins if S < E and loses if S > E;
- if S = E, the prediction stays pending.

#### Scenario: Win an UP prediction
- **GIVEN** an eligible UP prediction with entry price $67,500.00
- **WHEN** the authoritative settlement price is $67,501.00
- **THEN** the prediction is settled as won with settlement price $67,501.00
- **AND** the score changes by +1

#### Scenario: Lose an UP prediction
- **GIVEN** an eligible UP prediction with entry price $67,500.00
- **WHEN** the authoritative settlement price is $67,499.00
- **THEN** the prediction is settled as lost with settlement price $67,499.00
- **AND** the score changes by -1

#### Scenario: Win a DOWN prediction
- **GIVEN** an eligible DOWN prediction with entry price $67,500.00
- **WHEN** the authoritative settlement price is $67,499.00
- **THEN** the prediction is settled as won
- **AND** the score changes by +1

#### Scenario: Lose a DOWN prediction
- **GIVEN** an eligible DOWN prediction with entry price $67,500.00
- **WHEN** the authoritative settlement price is $67,501.00
- **THEN** the prediction is settled as lost
- **AND** the score changes by -1

#### Scenario: Business-rule matrix once eligible
- **WHEN** settlement is evaluated at or after eligibleAt for each row (direction, entry, settlement price):
  - (UP, 100, 101) -> won
  - (UP, 100, 99) -> lost
  - (DOWN, 100, 99) -> won
  - (DOWN, 100, 101) -> lost
  - (UP, 100, 100) -> pending
  - (DOWN, 100, 100) -> pending
- **THEN** each prediction gets the listed outcome

#### Scenario: Settlement exactly at eligibleAt is allowed
- **GIVEN** an UP prediction with entry 100 that becomes eligible at 20:01:00
- **WHEN** settlement is evaluated at exactly 20:01:00 with price 101
- **THEN** the prediction is won

### Requirement: Price ties keep the prediction pending until the price differs
If the authoritative price equals the entry price at evaluation time, the prediction SHALL remain pending with the score unchanged. Evaluation SHALL repeat until an authoritative price different from the entry price is observed, and that price settles the prediction.

#### Scenario: Repeated ties then a one-cent move
- **GIVEN** an eligible UP prediction with entry price $67,500.00
- **WHEN** the authoritative price is $67,500.00 at 60 seconds
- **THEN** the prediction is pending and the score is unchanged
- **WHEN** a later authoritative price is again $67,500.00
- **THEN** the prediction is still pending
- **WHEN** a later authoritative price is $67,500.01
- **THEN** the prediction is settled as won with settlement price $67,500.01

### Requirement: Settlement is performed by the server without the browser
The server SHALL settle eligible predictions on its own, without any client request, client timer or open browser. While the provider is available, an eligible prediction SHALL be evaluated repeatedly (default every 1 second), so a non-tie prediction settles within 10 seconds of `eligibleAt`.

#### Scenario: Browser closed during the prediction
- **GIVEN** at 20:00:00 the player places an UP prediction at $67,500.00
- **AND** at 20:00:15 they close the browser
- **WHEN** the prediction becomes eligible at 20:01:00 and the server observes an authoritative price of $67,520.00
- **THEN** the prediction is settled as won without any request from the player
- **AND** the player's score increases by 1

#### Scenario: Returning player sees the authoritative result
- **GIVEN** a player's prediction was settled while their browser was closed
- **WHEN** they open the application again
- **THEN** the UI shows that prediction's result, settlement price and updated score
- **AND** they can start a new prediction

#### Scenario: Return time does not influence the settlement price
- **GIVEN** a prediction eligible at 20:01:00, and the authoritative price observed shortly after that is $67,520.00
- **WHEN** the player returns at 23:00:00, when the price is $66,000.00
- **THEN** the settlement price is $67,520.00, not the price at the time of return

### Requirement: The open UI picks up settlement automatically
While the UI shows `Resolving…`, it SHALL check the server for the settled result at a short interval (default every 2 seconds) without any player action, and show the result once settled.

#### Scenario: Result appears without reload
- **GIVEN** the UI shows `Resolving…` for a pending prediction
- **WHEN** the server settles it
- **THEN** the UI shows the result within a few seconds without a page reload

### Requirement: Provider unavailability delays settlement instead of guessing
If no authoritative price can be obtained, the server SHALL leave eligible predictions pending with the score unchanged, and SHALL keep retrying. It SHALL NOT use client-supplied, cached-before-eligibility or invented prices. Settlement proceeds normally once a price is available.

#### Scenario: Provider down at eligibility
- **GIVEN** a prediction has reached eligibleAt
- **WHEN** the authoritative provider is unavailable
- **THEN** the prediction remains pending
- **AND** the score is unchanged
- **AND** the UI shows `Resolving…`

#### Scenario: Provider recovers
- **GIVEN** an eligible prediction is pending because the provider was unavailable
- **WHEN** the provider becomes available and reports a price different from the entry price
- **THEN** the prediction settles using that price

### Requirement: Settlement is applied exactly once
Each prediction SHALL be settled at most once. Repeated, retried or concurrent settlement attempts for the same prediction SHALL NOT change its outcome, settlement price, the score or the statistics after the first successful settlement.

#### Scenario: Duplicate processing has no effect
- **GIVEN** a player with score 5 and wins 3
- **WHEN** their eligible prediction settles as won
- **THEN** the score is 6 and wins is 4
- **WHEN** settlement of the same prediction is processed again, even with a different price
- **THEN** the score remains 6, wins remains 4, and the recorded outcome and settlement price are unchanged

#### Scenario: Concurrent settlement attempts
- **WHEN** two settlement attempts for the same eligible prediction run at the same time
- **THEN** the prediction is settled once and the score changes by exactly +1 or -1

### Requirement: Settled prediction records its result
A settled prediction SHALL record status `won` or `lost`, its settlement price and its settlement time. It SHALL stop being the player's active prediction and SHALL remain the player's most recent result until the next prediction settles.

#### Scenario: Settled record
- **WHEN** an UP prediction with entry $67,500.00 settles at $67,540.00
- **THEN** the player's most recent result shows direction UP, entry $67,500.00, settlement $67,540.00, status won and a settlement time at or after eligibleAt
- **AND** the player has no active prediction

### Requirement: Win and loss update score and statistics
On a win the server SHALL increment score, wins and current streak by 1 and set best streak to the higher of best and current streak. On a loss it SHALL decrement score by 1, increment losses by 1 and reset current streak to 0, leaving best streak unchanged. Scores may be negative.

#### Scenario: Statistics matrix
- **WHEN** each previous state receives the listed result:
  - score 0, wins 0, losses 0 + WIN -> score 1, wins 1, losses 0
  - score 0, wins 0, losses 0 + LOSS -> score -1, wins 0, losses 1
  - score 5, current streak 2, best 4 + WIN -> score 6, current streak 3, best 4
  - score 5, current streak 4, best 4 + WIN -> score 6, current streak 5, best 5
  - score 5, current streak 4, best 6 + LOSS -> score 4, current streak 0, best 6
- **THEN** the resulting state matches each row

#### Scenario: Winning streak progression
- **GIVEN** current streak 2 and best streak 4
- **WHEN** the player wins
- **THEN** current streak is 3 and best streak is 4
- **WHEN** the player wins two more times
- **THEN** current streak is 5 and best streak is 5
- **WHEN** the player then loses
- **THEN** current streak is 0 and best streak is 5

#### Scenario: Score can go negative
- **GIVEN** a player with score 0
- **WHEN** they lose twice
- **THEN** their score is -2
