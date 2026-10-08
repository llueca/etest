# Spec Delta

## Purpose

Lets a person start playing immediately as an anonymous player. The player can
choose a display name and gets the same player back, with all progress, when
they return in the same browser.

## ADDED Requirements

### Requirement: Anonymous player is created on first visit
When the application starts and the browser holds no player identifier, the system SHALL create a new player without registration, email or password. The player is assigned a stable opaque identifier, which the browser persists locally.

#### Scenario: First visit creates a fresh player
- **WHEN** the application starts in a browser that holds no player identifier
- **THEN** a new player is created
- **AND** the player has score 0, wins 0, losses 0, current streak 0, best streak 0 and games played 0
- **AND** the player's identifier is stored in the browser
- **AND** no registration, email or password is requested

#### Scenario: New player receives a generated display name
- **WHEN** a new player is created
- **THEN** the player has a non-empty generated display name of the form `Player-NNNN`, where `NNNN` are four digits
- **AND** the generated name is shown in the UI

#### Scenario: Identifiers are opaque and unique
- **WHEN** two players are created
- **THEN** their identifiers differ
- **AND** neither identifier encodes the display name or any statistic

### Requirement: Returning player is recognised
When the application starts and the browser holds the identifier of an existing player, the system SHALL load that player instead of creating a new one.

#### Scenario: Existing player is restored
- **GIVEN** the browser holds the identifier of player `player-123`, whose score is 7
- **WHEN** the application starts
- **THEN** no new player is created
- **AND** a score of 7 is displayed

### Requirement: Player progress survives closing the browser
The system SHALL persist each player's display name, score, wins, losses, current streak, best streak, active prediction (if any) and most recent result on the server. These SHALL be restored unchanged when the player returns.

#### Scenario: Statistics are restored unchanged
- **GIVEN** a player with score 4, wins 9, losses 5, current streak 0 and best streak 3
- **WHEN** they close the browser and open the application again in the same browser
- **THEN** score 4, wins 9, losses 5, games played 14, current streak 0 and best streak 3 are shown

#### Scenario: Active prediction is restored
- **GIVEN** a player with a pending UP prediction at entry price $67,500.00
- **WHEN** they reload the application before it settles
- **THEN** the same pending prediction is shown, with the same entry price and the same eligibility time

### Requirement: Unknown stored identifier starts a new player
When the browser holds an identifier that the server does not recognise, the system SHALL create a new player and replace the stored identifier with the new one.

#### Scenario: Stale identifier is replaced
- **GIVEN** the browser holds an identifier that matches no player on the server
- **WHEN** the application starts
- **THEN** a new player with score 0 is created
- **AND** the browser's stored identifier is replaced with the new player's identifier

### Requirement: Temporary backend failure does not discard identity
If the server cannot be reached while the player is being created or restored, the system SHALL show a retryable error and keep any stored identifier. It SHALL NOT create a replacement player because of that failure.

#### Scenario: Backend unreachable on startup
- **GIVEN** the browser holds the identifier of an existing player
- **WHEN** the application starts and the server is unreachable
- **THEN** the UI shows an error that the player's progress could not be loaded, with a retry action
- **AND** the stored identifier is unchanged
- **AND** retrying after the server becomes reachable restores the existing player

#### Scenario: Loading state while restoring
- **WHEN** the application is creating or restoring the player
- **THEN** the UI shows a loading state instead of a score of 0 or empty statistics

### Requirement: Player identifiers are never exposed to other players
Because the identifier is the player's only credential, the system SHALL NOT include another player's identifier in any response, including leaderboards.

#### Scenario: Leaderboard responses contain no identifiers of other players
- **WHEN** any player requests a leaderboard
- **THEN** the response contains display names and statistics of ranked players but no identifiers of other players

### Requirement: Player can change their display name
The system SHALL let a player replace their display name. Leading and trailing whitespace is removed before validation. The trimmed name SHALL be 1 to N characters long, where N is the configured maximum (default 24), and SHALL NOT contain control characters. Names need not be unique.

#### Scenario: Valid name is saved
- **WHEN** the player submits `"Dario"`
- **THEN** their display name becomes `"Dario"`

#### Scenario: Surrounding whitespace is trimmed
- **WHEN** the player submits `"  Dario  "`
- **THEN** their display name becomes `"Dario"`

#### Scenario: Empty name is rejected
- **WHEN** the player submits `""`
- **THEN** the change is rejected with a validation error
- **AND** the previous display name is kept

#### Scenario: Whitespace-only name is rejected
- **WHEN** the player submits `"   "`
- **THEN** the change is rejected with a validation error
- **AND** the previous display name is kept

#### Scenario: Name longer than the maximum is rejected
- **GIVEN** the configured maximum length is 24
- **WHEN** the player submits a name that is 25 characters long after trimming
- **THEN** the change is rejected with a validation error stating the maximum length

#### Scenario: Name at the maximum length is accepted
- **GIVEN** the configured maximum length is 24
- **WHEN** the player submits a name that is exactly 24 characters long after trimming
- **THEN** their display name becomes that name

#### Scenario: Name containing control characters is rejected
- **WHEN** the player submits a name containing a line break or another control character
- **THEN** the change is rejected with a validation error

#### Scenario: Duplicate names are allowed
- **GIVEN** another player is named `"Dario"`
- **WHEN** the player submits `"Dario"`
- **THEN** their display name becomes `"Dario"`

#### Scenario: Changing the name keeps progress
- **GIVEN** a player with score 5, wins 8, losses 3 and best streak 4
- **WHEN** they change their display name
- **THEN** score, wins, losses, streaks and any active prediction are unchanged

### Requirement: Name editing gives clear feedback
The name-editing UI SHALL show validation errors next to the input, keep what the player typed when saving fails, show when a save is in progress and confirm success. The player SHALL be able to cancel and keep the current name.

#### Scenario: Validation error is associated with the input
- **WHEN** the player submits an invalid name
- **THEN** an error message is shown and programmatically associated with the name input
- **AND** the entered text remains in the input

#### Scenario: Cancelling keeps the current name
- **WHEN** the player starts editing, types a new name and cancels (including by pressing Escape)
- **THEN** the displayed name is unchanged and no change is sent

#### Scenario: Successful save is confirmed
- **WHEN** a valid name is saved
- **THEN** the new name is displayed wherever the player's name appears, including the leaderboards after their next refresh
