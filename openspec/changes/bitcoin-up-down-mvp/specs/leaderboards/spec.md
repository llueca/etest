# Spec Delta

## Purpose

Makes the game competitive with two rankings: a score leaderboard that rewards
cumulative results, and a predictor leaderboard that rewards sustained accuracy
and doesn't automatically favour the most active players.

## ADDED Requirements

### Requirement: Only players with settled predictions are ranked
Both leaderboards SHALL include only players with at least one settled prediction (games played ≥ 1).

#### Scenario: New player excluded
- **GIVEN** a player with no settled predictions
- **WHEN** either leaderboard is requested
- **THEN** that player does not appear on it

#### Scenario: Player appears after first settlement
- **GIVEN** a player whose first prediction has just settled as lost, leaving score -1
- **WHEN** the score leaderboard is requested and fewer than 10 players are eligible
- **THEN** that player appears with score -1

### Requirement: Score leaderboard ordering
The score leaderboard SHALL list up to the configured number of eligible players (default 10). Order is score descending, then adjusted accuracy descending, then games played descending, then the earliest-created player first. Each row shows its position (1, 2, 3, … even when tied), display name and score.

#### Scenario: Ordered by score
- **GIVEN** eligible players Alice with score 8, Bob with score 5 and Charlie with score 9
- **WHEN** the score leaderboard is shown
- **THEN** the rows are `1 Charlie 9`, `2 Alice 8`, `3 Bob 5`

#### Scenario: Score tie broken by adjusted accuracy
- **GIVEN** eligible players P with score 2 (wins 2, losses 0) and Q with score 2 (wins 4, losses 2)
- **WHEN** the score leaderboard is shown
- **THEN** P (adjusted accuracy 7/12 ≈ 58.33%) is ranked above Q (adjusted accuracy 9/16 = 56.25%)

#### Scenario: Remaining ties broken by games played, then creation order
- **GIVEN** two eligible players with equal score and equal adjusted accuracy
- **WHEN** the score leaderboard is shown
- **THEN** the player with more games played ranks higher
- **AND** if games played are also equal, the player created earlier ranks higher

#### Scenario: Limited to the top entries
- **GIVEN** 15 eligible players and a configured size of 10
- **WHEN** the score leaderboard is shown
- **THEN** exactly the 10 highest-ranked players are listed, in positions 1 to 10

### Requirement: Adjusted accuracy
Adjusted accuracy SHALL be (wins + 5) ÷ (games played + 10), a neutral 50% prior worth 5 wins and 5 losses. Rankings SHALL compare exact values, not rounded ones.

#### Scenario: Adjusted accuracy examples
- **WHEN** adjusted accuracy is computed for: A (wins 1, losses 0); B (wins 3, losses 0); C (wins 6, losses 4); D (wins 80, losses 20)
- **THEN** A is 6/11 ≈ 54.55%, B is 8/13 ≈ 61.54%, C is 11/20 = 55.00% and D is 85/110 ≈ 77.27%

### Requirement: Predictor leaderboard ordering
The predictor leaderboard SHALL list up to the configured number of eligible players (default 10). Order is adjusted accuracy descending, then games played descending, then the earliest-created player first. Each row shows its position, display name, adjusted accuracy (one decimal), raw accuracy (whole percent) and games played.

#### Scenario: Evidence outweighs a single lucky win
- **GIVEN** eligible players A (wins 1, losses 0), B (wins 3, losses 0), C (wins 6, losses 4) and D (wins 80, losses 20)
- **WHEN** the predictor leaderboard is shown
- **THEN** the order is D, B, C, A
- **AND** B ranks above A although both have 100% raw accuracy
- **AND** C (55.00%) ranks above A (54.55%)

#### Scenario: Row content
- **GIVEN** player B with wins 3 and losses 0
- **WHEN** the predictor leaderboard is shown
- **THEN** B's row shows adjusted accuracy `61.5%`, raw accuracy `100%` and games played `3`

### Requirement: Current player is identifiable
On each leaderboard, the current player's row SHALL be marked with a visible text label (for example `You`), not by colour alone.

#### Scenario: Current player inside the top entries
- **GIVEN** the current player is ranked 4th on the score leaderboard
- **WHEN** the score leaderboard is shown
- **THEN** the 4th row is labelled as the current player

#### Scenario: Current player outside the top entries
- **GIVEN** the current player has settled predictions but is not among the listed players of a leaderboard
- **WHEN** that leaderboard is shown
- **THEN** the current player's own value (score on the score leaderboard; adjusted accuracy, raw accuracy and games played on the predictor leaderboard) is shown separately below the list, without a global rank

#### Scenario: Current player not yet eligible
- **GIVEN** the current player has no settled predictions
- **WHEN** a leaderboard is shown
- **THEN** a note explains that completing a prediction will put them on the leaderboard

### Requirement: Leaderboards refresh without realtime streaming
Leaderboards SHALL be loaded when the application starts and reloaded after the current player's prediction settles or their display name changes. They are not streamed in realtime.

#### Scenario: Refresh after own settlement
- **GIVEN** the leaderboards are visible
- **WHEN** the current player's prediction settles
- **THEN** the leaderboards are reloaded and reflect the player's new statistics

### Requirement: Leaderboard loading, empty and error states
Each leaderboard SHALL show a loading state while it loads, an empty state when no players are eligible, and a retryable error state on failure. A leaderboard failure SHALL NOT block gameplay.

#### Scenario: No eligible players
- **WHEN** no player has a settled prediction
- **THEN** each leaderboard shows an empty state saying that no one is ranked yet

#### Scenario: Leaderboard request fails
- **WHEN** loading the leaderboards fails
- **THEN** an error with a retry action is shown in the leaderboard area
- **AND** the price, prediction controls and active prediction keep working
