# Spec Delta

## Purpose

Keeps the whole game usable on mobile, tablet and desktop screens, and for
players who use a keyboard or assistive technology, so accessibility and
responsiveness are part of correct behaviour.

## ADDED Requirements

### Requirement: Core gameplay works at representative widths
At viewport widths of 375 px, 768 px and 1280 px, all of the following SHALL be visible and operable without horizontal scrolling:
- the live price and chart;
- the UP and DOWN controls;
- the countdown and live status;
- the result;
- the player statistics;
- name editing;
- both leaderboards.

The leaderboards may be placed differently on different layouts.

#### Scenario: Mobile width
- **WHEN** the application is used at a viewport width of 375 px
- **THEN** the page has no horizontal scrolling
- **AND** a player can place a prediction, follow it and see the result

#### Scenario: Tablet and desktop widths
- **WHEN** the application is used at viewport widths of 768 px and 1280 px
- **THEN** the page has no horizontal scrolling and all core gameplay elements are visible and operable

### Requirement: Controls are real, keyboard-operable interactive elements
UP, DOWN, name editing, retry actions and every other action SHALL be native interactive controls with accessible names. They SHALL be reachable with Tab in a logical order and activated with Enter or Space.

#### Scenario: Predict with the keyboard
- **WHEN** a keyboard-only player tabs to the UP control and presses Enter
- **THEN** an UP prediction is placed exactly as with a pointer

#### Scenario: Accessible names
- **WHEN** assistive technology inspects the prediction controls
- **THEN** they are exposed as buttons named so that the direction (higher/UP, lower/DOWN) is clear

### Requirement: Disabled state is exposed
When UP and DOWN are unavailable, they SHALL expose a disabled state to assistive technology. The reason (prediction active, request in progress, live data unavailable, player loading) SHALL be available as text.

#### Scenario: Disabled during an active prediction
- **WHEN** a prediction is active
- **THEN** assistive technology reports the UP and DOWN controls as disabled
- **AND** a visible text explains that a prediction is in progress

### Requirement: Meaning is never conveyed by colour alone
Live status (`WINNING`/`LOSING`/`TIED`), results (`WIN`/`LOSS`), score changes (`+1`/`-1`), stale-data indications and the current-player marker on leaderboards SHALL each be communicated with text, and optionally also with colour or icons.

#### Scenario: Greyscale comprehension
- **WHEN** the UI is viewed without colour perception
- **THEN** the player can still tell whether they are winning, losing or tied, whether they won or lost, and which leaderboard row is theirs

### Requirement: Important status changes are announced
The UI SHALL announce through an accessible live region:
- prediction placed (with direction and entry price);
- `Resolving…`;
- the result (with ±1 and new score);
- errors;
- live data lost and restored.

It SHALL NOT announce each price tick, each countdown second or each change between `WINNING` and `LOSING`. The current live status SHALL stay readable on demand as text.

#### Scenario: Result is announced
- **WHEN** a prediction settles as won and the score goes from 6 to 7
- **THEN** a screen reader announces the win, `+1` and the new score of 7 without the player moving focus

#### Scenario: No announcement flood
- **WHEN** the live price updates several times per second during an active prediction
- **THEN** no announcement is made for individual price updates or countdown seconds

### Requirement: Visible focus and sufficient contrast
Every focusable control SHALL show a clearly visible focus indicator. Text and essential UI graphics SHALL meet WCAG 2.2 AA contrast: 4.5:1 for normal text, and 3:1 for large text and for UI components and graphical objects needed to understand the game.

#### Scenario: Focus indicator
- **WHEN** a keyboard user moves focus to any control
- **THEN** a visible focus indicator is shown on that control

#### Scenario: Contrast
- **WHEN** the UI is checked with an automated accessibility checker
- **THEN** no colour-contrast violations are reported for game text or controls

### Requirement: Motion respects user preference
Any optional animation or transition SHALL be reduced or disabled when the user's system requests reduced motion. Animation SHALL never be the only way a state change is communicated.

#### Scenario: Reduced motion
- **WHEN** the operating system's reduced-motion preference is enabled
- **THEN** non-essential animations do not play, and all state changes remain visible as text

#### Scenario: Reduced motion chart
- **GIVEN** the operating system's reduced-motion preference is enabled
- **WHEN** the chart shows live data
- **THEN** the chart moves forward in steps no more than once per second instead of continuously
- **AND** the price scale and the line ending at the displayed price behave as they do without reduced motion

#### Scenario: Reduced motion status changes
- **GIVEN** the operating system's reduced-motion preference is enabled
- **WHEN** the live status changes or a result appears
- **THEN** no transition or animation runs, and the new state is shown at once

### Requirement: Status changes use brief transitions that do not move the layout
When the live status changes between WINNING, LOSING and TIED, and when a new result appears, the UI SHALL use a brief transition of no more than 300 ms that changes only colour, opacity or a transform. The transition SHALL NOT move any other element. The new status text SHALL be in the page from the start of the transition. The displayed price SHALL change in place on each market event, with no flash or animation.

#### Scenario: Live status changes
- **GIVEN** a prediction is pending and the live status is WINNING
- **WHEN** a market event makes the live status LOSING
- **THEN** the text LOSING is shown at once, and its colour changes through a transition that ends within 300 ms
- **AND** the UP/DOWN controls, countdown and price keep their on-screen positions

#### Scenario: Result appears
- **WHEN** a settled result replaces the active prediction
- **THEN** the result card fades in within 300 ms, with its text in the page from the start
- **AND** no other element changes size or position during the fade

#### Scenario: Price ticks are not animated
- **WHEN** valid market events change the displayed price
- **THEN** the price text changes in place, with no flash, colour pulse or other animation
