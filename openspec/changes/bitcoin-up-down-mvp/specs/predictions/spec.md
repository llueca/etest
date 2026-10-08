# Spec Delta

## Purpose

Lets a player predict whether BTC/USD will go higher (UP) or lower (DOWN) and
then follow the active prediction. While it is active the player sees a
server-anchored countdown, live WINNING/LOSING/TIED feedback and the entry
price on the chart. The server enforces at most one active prediction per
player.

## ADDED Requirements

### Requirement: Player can place an UP or DOWN prediction
When the player has no active prediction, an UP control and a DOWN control SHALL be available. The request SHALL convey only the chosen direction. The server SHALL set the entry price from the authoritative BTC/USD provider and set `createdAt` from its own clock, with `eligibleAt` = `createdAt` + the configured prediction window. Placing a prediction SHALL NOT change the score.

#### Scenario: Predict UP
- **GIVEN** the player's score is 3 and the authoritative BTC/USD price is $67,500.00
- **WHEN** the player selects UP and the server receives the request at 20:00:00 server time
- **THEN** a pending prediction is created with direction UP, entry price $67,500.00, created at 20:00:00 and eligible at 20:01:00
- **AND** the score remains 3
- **AND** the UI shows the entry price $67,500.00 returned by the server and starts the countdown

#### Scenario: Predict DOWN
- **GIVEN** the authoritative BTC/USD price is $67,500.00
- **WHEN** the player selects DOWN and the server receives the request at 20:00:00 server time
- **THEN** a pending prediction is created with direction DOWN, entry price $67,500.00 and eligible at 20:01:00

#### Scenario: Client cannot choose the entry price or timing
- **WHEN** a prediction request includes an entry price, creation time or eligibility time chosen by the client
- **THEN** those values are ignored
- **AND** the prediction uses the server's authoritative price and the server's clock

#### Scenario: Displayed entry price is the server's
- **GIVEN** the live price shown in the browser is $67,503.42
- **WHEN** the player selects UP and the server records an authoritative entry price of $67,501.10
- **THEN** the active prediction shows entry price $67,501.10

#### Scenario: Invalid direction is rejected
- **WHEN** a prediction request has a direction other than `up` or `down`, or no direction
- **THEN** the request is rejected as invalid input and no prediction is created

#### Scenario: Unknown player cannot predict
- **WHEN** a prediction request carries a missing or unrecognised player identifier
- **THEN** the request is rejected as unauthorised and no prediction is created

### Requirement: Prediction window is configurable with a 60-second minimum
The prediction window (the time from `createdAt` to `eligibleAt`) SHALL be configurable, with a default of 60 seconds. A configured window shorter than 60 seconds SHALL be rejected as invalid configuration instead of being used. The window in force when a prediction is created SHALL fix that prediction's `eligibleAt`; changing the configuration SHALL NOT change the eligibility of existing predictions.

#### Scenario: Default window
- **GIVEN** no prediction window is configured
- **WHEN** a prediction is created at 20:00:00 server time
- **THEN** it is eligible at 20:01:00

#### Scenario: Longer configured window
- **GIVEN** the configured prediction window is 90 seconds
- **WHEN** a prediction is created at 20:00:00 server time
- **THEN** it is eligible at 20:01:30
- **AND** it is not settled at 20:01:29.999, even with a winning price
- **AND** it can be settled from 20:01:30

#### Scenario: Window below the minimum is rejected
- **WHEN** the configured prediction window is shorter than 60 seconds
- **THEN** the system refuses the configuration with a configuration error and does not use it

#### Scenario: Changing the window does not affect existing predictions
- **GIVEN** a pending prediction created with a 90-second window, eligible at 20:01:30
- **WHEN** the configured window is changed to 60 seconds before it settles
- **THEN** the prediction is still not settled before 20:01:30

#### Scenario: The UI states the configured window
- **GIVEN** the configured prediction window is 90 seconds
- **WHEN** a player without a result is invited to make a prediction
- **THEN** the invitation states that the prediction is decided after 90 seconds

### Requirement: Predictions require usable live data in the UI
The UI SHALL disable UP and DOWN unless:
- the player is loaded;
- no prediction is active;
- no prediction request is in flight;
- live market data is fresh.

#### Scenario: Controls disabled while a request is in flight
- **WHEN** the player selects UP and the server has not responded yet
- **THEN** both UP and DOWN are disabled
- **AND** selecting them again does not send another request

#### Scenario: Controls disabled without fresh live data
- **WHEN** live market data is connecting, stale or unavailable
- **THEN** UP and DOWN are disabled and the reason is shown

### Requirement: At most one active prediction per player
The server SHALL reject a new prediction while the player already has a pending one, leaving the existing prediction unchanged. This SHALL hold for concurrent and duplicated requests. UI restrictions alone are not enough.

#### Scenario: Second prediction rejected
- **GIVEN** player A has pending prediction P1
- **WHEN** another prediction request for player A is received
- **THEN** the request is rejected with a conflict indicating that a prediction is already active
- **AND** P1 remains the only active prediction, unchanged

#### Scenario: Concurrent requests create exactly one prediction
- **GIVEN** player A has no active prediction
- **WHEN** an UP request and a DOWN request for player A arrive at almost the same time
- **THEN** exactly one prediction is created
- **AND** the other request is rejected with the same conflict

#### Scenario: Controls unavailable while a prediction is active
- **WHEN** the player has a pending prediction
- **THEN** UP and DOWN are disabled or not offered

#### Scenario: UI re-syncs after a conflict
- **GIVEN** a prediction was started for this player from another tab
- **WHEN** the player selects UP and the server rejects it because a prediction is already active
- **THEN** the UI shows the existing active prediction from the server, with its direction, entry price and countdown

#### Scenario: New prediction allowed after settlement
- **GIVEN** the player's previous prediction has been settled
- **WHEN** the player selects UP or DOWN
- **THEN** a new prediction is created

### Requirement: Prediction creation failure is retryable and leaves no prediction
If the server cannot obtain an authoritative BTC/USD price, it SHALL NOT create a prediction and SHALL respond with a retryable error. The UI SHALL show a retryable error, start no countdown and re-enable the controls. If the request's outcome is unknown, the UI SHALL re-sync with the server before offering a retry.

#### Scenario: Provider unavailable at creation
- **GIVEN** the authoritative price provider is unavailable or does not answer within the configured timeout
- **WHEN** the player selects UP
- **THEN** no prediction is created
- **AND** no countdown begins
- **AND** the UI shows an error stating the prediction could not be started and can be retried
- **AND** UP and DOWN become available again, as long as live data is fresh

#### Scenario: Retry succeeds after recovery
- **GIVEN** a prediction attempt failed because the provider was unavailable
- **WHEN** the provider recovers and the player selects UP again
- **THEN** a pending prediction is created normally

#### Scenario: Unknown outcome is reconciled
- **WHEN** the prediction request fails without a server response (for example, a network timeout)
- **THEN** the UI reloads the player's state from the server
- **AND** shows the active prediction if one was created, or otherwise a retryable error

### Requirement: Countdown is derived from the server's eligibility time
While a prediction is pending, the UI SHALL show the whole seconds remaining until `eligibleAt`, rounded up. The value SHALL come from `eligibleAt` and the server's clock, never from counting down 60 locally. It SHALL never be negative. At zero, if not yet settled, the UI SHALL show `Resolving…`.

#### Scenario: Remaining time
- **GIVEN** eligibleAt is 20:01:00 server time
- **WHEN** the server-corrected current time is 20:00:37
- **THEN** the UI shows 23 seconds remaining

#### Scenario: Resolving after eligibility
- **GIVEN** eligibleAt is 20:01:00 server time
- **WHEN** the server-corrected current time reaches or passes 20:01:00 and the prediction is still pending
- **THEN** the UI shows `Resolving…` and no negative or zero-padded negative time

#### Scenario: Device clock is wrong
- **GIVEN** the device clock is 30 seconds ahead of the server clock
- **WHEN** a prediction eligible at 20:01:00 server time is viewed at 20:00:37 server time
- **THEN** the UI shows 23 seconds remaining

#### Scenario: Restored prediction resumes the correct countdown
- **GIVEN** a prediction eligible at 20:01:00 server time
- **WHEN** the player reloads the page at 20:00:50 server time
- **THEN** the UI shows 10 seconds remaining, not 60

### Requirement: Live WINNING / LOSING / TIED feedback
While a prediction is pending and live data is fresh, the UI SHALL show `WINNING`, `LOSING` or `TIED` by comparing the live price with the entry price at cent precision. This status is informational and SHALL NOT affect settlement. Without fresh live data, the UI SHALL show that live status is unavailable.

#### Scenario: UP prediction status
- **GIVEN** an UP prediction with entry price $67,500.00
- **WHEN** the live price is $67,510.00, then $67,490.00, then $67,500.00
- **THEN** the status shows `WINNING`, then `LOSING`, then `TIED`

#### Scenario: DOWN prediction status
- **GIVEN** a DOWN prediction with entry price $67,500.00
- **WHEN** the live price is $67,490.00, then $67,510.00, then $67,500.00
- **THEN** the status shows `WINNING`, then `LOSING`, then `TIED`

#### Scenario: One-cent difference counts
- **GIVEN** an UP prediction with entry price $67,500.00
- **WHEN** the live price is $67,500.01
- **THEN** the status shows `WINNING`

#### Scenario: Live status does not settle
- **GIVEN** a pending UP prediction whose live status is `WINNING`
- **WHEN** the browser is closed before settlement
- **THEN** the outcome is decided only by server settlement

#### Scenario: Live status unavailable
- **GIVEN** a pending prediction
- **WHEN** live data becomes stale or the connection is lost
- **THEN** the UI shows that live status is unavailable instead of a possibly outdated `WINNING`, `LOSING` or `TIED`
- **AND** the countdown continues

### Requirement: Active prediction details are visible
While a prediction is pending, the UI SHALL show its direction and authoritative entry price.

#### Scenario: Active prediction summary
- **WHEN** the player has a pending DOWN prediction with entry price $67,500.00
- **THEN** the UI shows that the prediction is DOWN with entry price `$67,500.00`

### Requirement: Entry price is marked on the chart
While a prediction is pending, the chart SHALL show a reference line at the authoritative entry price, labelled with that price. It SHALL be distinguishable from the live price line by more than colour.

#### Scenario: Entry reference shown
- **GIVEN** a pending prediction with entry price $67,500.00
- **WHEN** the chart is displayed
- **THEN** a reference labelled `$67,500.00` is visible at the entry price level
- **AND** it is visually distinct from the live price line (for example, dashed and labelled)

#### Scenario: Live line crosses the entry price
- **WHEN** the live price moves above and below the entry price during the prediction
- **THEN** the chart shows the live line on both sides of the entry reference
- **AND** the live status changes between `WINNING` and `LOSING` to match

#### Scenario: Entry reference removed after settlement
- **WHEN** the prediction is settled
- **THEN** the entry reference no longer shows as an active prediction marker
