# Spec Delta

## Purpose

Explains the game to players before they play: how a round works, how it is
scored and how the leaderboards rank players. The instructions open when the
game loads, a player can turn that off for their browser, and the
instructions can be reopened at any time.

## ADDED Requirements

### Requirement: Instructions open when the game loads
When the game screen appears (after the player has been restored or created), a modal "How to play" dialog SHALL already be open in front of it, unless "Don't show again" was chosen in this browser. The dialog SHALL NOT open on the loading, error or configuration-error screens. It opens automatically at most once per page load.

#### Scenario: First visit
- **WHEN** a player opens the game for the first time in this browser
- **THEN** the "How to play" dialog is open as soon as the game screen appears, with the game behind it

#### Scenario: Shown again on the next load
- **GIVEN** the player closed the dialog without choosing "Don't show again"
- **WHEN** they reload the page
- **THEN** the dialog is open again when the game screen appears

#### Scenario: Not shown after opting out
- **GIVEN** the player chose "Don't show again"
- **WHEN** they reload the page or open the game in a new tab of the same browser
- **THEN** the dialog does not open, and the game can be used at once

#### Scenario: Not shown on error screens
- **WHEN** the player's progress cannot be loaded and the retryable error is shown
- **THEN** the dialog is not open

### Requirement: Instructions explain the rules accurately
The dialog SHALL explain how a round works, how it is scored and how the leaderboards rank players. It SHALL use the game's actual rules and configured values, and SHALL never contradict them.

#### Scenario: Content
- **WHEN** the dialog is open
- **THEN** it explains that the player predicts whether BTC/USD will be higher (UP) or lower (DOWN) after the prediction window
- **AND** that the entry price is the server's price when the prediction is made, and only one prediction can be active at a time
- **AND** that once the window has passed, the first price different from the entry price decides the result: correct +1, incorrect −1
- **AND** that the live WINNING/LOSING status is only a guide, and the server's result is what counts
- **AND** that a prediction is settled even if the page is closed, and progress is kept in this browser
- **AND** that one leaderboard ranks by score, and the other by an adjusted accuracy that favours a longer record over a few lucky guesses

#### Scenario: Configured prediction window
- **GIVEN** the configured prediction window is 90 seconds
- **WHEN** the dialog is open
- **THEN** it states the window as 90 seconds
- **AND** with the default configuration it states 1 minute

### Requirement: Instructions dialog is accessible and closes predictably
The dialog SHALL be a modal dialog named "How to play". While it is open, the game behind it SHALL NOT be reachable by keyboard or pointer, and keyboard focus SHALL stay inside the dialog. It SHALL close with its "Got it" button and with Escape. After it closes, keyboard focus SHALL be on the "How to play" button.

#### Scenario: Keyboard use
- **GIVEN** the dialog is open
- **WHEN** a keyboard user presses Tab repeatedly
- **THEN** focus moves only between the dialog's controls
- **WHEN** they press Escape
- **THEN** the dialog closes and focus is on the "How to play" button

#### Scenario: Close with the button
- **WHEN** the player activates "Got it"
- **THEN** the dialog closes, and the game can be used

#### Scenario: Background is blocked while open
- **GIVEN** the dialog is open
- **WHEN** the player tries to activate UP or DOWN behind it
- **THEN** no prediction is placed

#### Scenario: Small screens
- **GIVEN** a viewport 375 px wide
- **WHEN** the dialog is open
- **THEN** all of its content and controls can be reached, scrolling inside the dialog if needed, and the page does not scroll horizontally

### Requirement: "Don't show again" is remembered in this browser
The dialog SHALL contain a checkbox labelled "Don't show again". It is unchecked by default and SHALL reflect the saved choice whenever the dialog opens. Changing it SHALL save the choice for this browser at once. The choice SHALL NOT be stored with the player's server-side progress. If the browser cannot store it, the dialog keeps opening on load and no error is shown.

#### Scenario: Opt out
- **GIVEN** the dialog opened on load
- **WHEN** the player checks "Don't show again" and closes the dialog
- **THEN** the dialog does not open on the next load

#### Scenario: Opt back in
- **GIVEN** the player chose "Don't show again"
- **WHEN** they open the dialog with "How to play"
- **THEN** "Don't show again" is checked
- **WHEN** they uncheck it and close the dialog
- **THEN** the dialog opens again on the next load

#### Scenario: Storage unavailable
- **GIVEN** the browser refuses to store the choice
- **WHEN** the player checks "Don't show again"
- **THEN** no error is shown, and the dialog opens again on the next load

### Requirement: Instructions can be reopened at any time
The game screen SHALL always show a "How to play" button that opens the same dialog: during an active prediction, while resolving, and while live data is stale. Opening or closing the dialog SHALL NOT change any game state.

#### Scenario: Reopen the instructions
- **GIVEN** the dialog is closed
- **WHEN** the player activates "How to play"
- **THEN** the dialog opens

#### Scenario: Active prediction continues
- **GIVEN** a pending prediction with 40 seconds left
- **WHEN** the player opens the dialog, waits 10 seconds and closes it
- **THEN** the same prediction is still pending with about 30 seconds left, or has been settled by the server
