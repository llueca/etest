# Spec Delta

## Purpose

Gives players clear feedback on the result of each settled prediction and a
summary of their performance (score, games played, wins, losses, accuracy and
streaks) so the score has context.

## ADDED Requirements

### Requirement: Winning result feedback
When the player's most recent prediction has been won, the UI SHALL show:
- a `WIN` result communicated by text, not only colour;
- the direction;
- the entry price → settlement price;
- `+1`;
- the score before → after;
- the ability to play again.

#### Scenario: Win shown
- **GIVEN** the player's score was 6 and their UP prediction with entry $67,500.00 settles at $67,540.00
- **WHEN** the result is displayed
- **THEN** the UI shows `WIN`, `UP`, `$67,500.00 → $67,540.00`, `+1` and `Score: 6 → 7`
- **AND** UP and DOWN are available to start the next prediction, as long as live data is fresh

### Requirement: Losing result feedback
When the player's most recent prediction has been lost, the UI SHALL show the same elements as for a win, with a `LOSS` result communicated by text and `-1`.

#### Scenario: Loss shown
- **GIVEN** the player's score was 6 and their UP prediction with entry $67,500.00 settles at $67,480.00
- **WHEN** the result is displayed
- **THEN** the UI shows `LOSS`, `UP`, `$67,500.00 → $67,480.00`, `-1` and `Score: 6 → 5`
- **AND** UP and DOWN are available to start the next prediction, as long as live data is fresh

### Requirement: Most recent result stays visible until the next prediction
The most recent result SHALL stay visible, including after a reload or a return visit, until the player starts a new prediction. No dismiss action is required.

#### Scenario: Result survives reload
- **GIVEN** the player's last prediction was won and they have not started another
- **WHEN** they reload the application
- **THEN** the same win result is shown

#### Scenario: Starting a new prediction replaces the result
- **GIVEN** a result is displayed
- **WHEN** the player starts a new prediction
- **THEN** the result is replaced by the active prediction view

#### Scenario: No result for a new player
- **WHEN** a player has never had a prediction settled
- **THEN** no result is shown, and the UI invites them to make their first prediction

### Requirement: Player statistics summary
The UI SHALL show the player's score, games played (wins + losses), wins, losses, accuracy, current streak and best streak. Accuracy is wins ÷ games played as a whole-number percentage rounded to the nearest integer, or `—` when no games have been played.

#### Scenario: Statistics with history
- **GIVEN** a player with wins 7 and losses 3
- **WHEN** the statistics are shown
- **THEN** games played is 10 and accuracy is `70%`

#### Scenario: Accuracy rounding
- **GIVEN** a player with wins 2 and losses 1
- **WHEN** the statistics are shown
- **THEN** accuracy is `67%`

#### Scenario: Statistics with no games
- **GIVEN** a new player
- **WHEN** the statistics are shown
- **THEN** score 0, games played 0, wins 0, losses 0, current streak 0, best streak 0 and accuracy `—` are shown

#### Scenario: Statistics update after settlement without reload
- **GIVEN** the statistics are visible
- **WHEN** the player's prediction settles while the page is open
- **THEN** the score, games played, wins or losses, accuracy and streaks update to the server's values without a page reload
