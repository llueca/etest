# Spec Delta

## Purpose

Shows players the live BTC/USD market (current price and recent movement)
so predictions feel connected to a real market. Players are always told when
live data is connecting, stale or reconnecting. Live data is informational only
and never decides an outcome.

## ADDED Requirements

### Requirement: Current BTC/USD price is prominently displayed
The UI SHALL prominently display the most recent valid live BTC/USD price, formatted in US dollars with two decimals and thousands separators, and SHALL update it on every valid market event.

#### Scenario: Price updates on a new market event
- **GIVEN** the displayed price is `$67,500.00`
- **WHEN** a valid market event reports 67503.42
- **THEN** the displayed price becomes `$67,503.42`

#### Scenario: Price updates do not move the layout
- **WHEN** the displayed price changes between two values with the same number of integer digits (for example `$67,500.00` to `$67,511.18`)
- **THEN** the UP/DOWN controls, countdown and status elements keep their on-screen positions
- **AND** the page is not reloaded or re-initialised

### Requirement: Invalid market messages are ignored
The UI SHALL treat as a valid update only a message that reports a BTC-USD price that is a finite positive number. Any other message SHALL NOT change the displayed price or chart, and SHALL NOT count as a valid update for staleness.

#### Scenario: Malformed message is ignored
- **GIVEN** the displayed price is `$67,500.00`
- **WHEN** a message arrives with a missing, non-numeric, zero or negative price, or for a different product
- **THEN** the displayed price remains `$67,500.00`

### Requirement: Connecting state before the first price
Until the first valid market event arrives, the UI SHALL show that it is connecting to live market data. It SHALL NOT show a placeholder price as if it were real.

#### Scenario: Initial load
- **WHEN** the application has loaded but no valid market event has arrived yet
- **THEN** the price area indicates that live data is connecting
- **AND** the UP and DOWN controls are disabled

### Requirement: Stale market data is indicated and blocks new predictions
If no valid market event has arrived within the configured stale threshold (default 10 seconds), the UI SHALL mark live data as stale or unavailable and SHALL disable starting a new prediction until fresh data arrives.

#### Scenario: Feed goes quiet
- **GIVEN** the configured stale threshold is 10 seconds
- **WHEN** 10 seconds pass without a valid market event
- **THEN** the UI indicates that live data is stale or unavailable
- **AND** the last known price, if shown, is visibly marked as not live
- **AND** the UP and DOWN controls are disabled

#### Scenario: Fresh data re-enables predictions
- **GIVEN** live data is marked stale and no prediction is active
- **WHEN** a valid market event arrives
- **THEN** the stale indication is removed
- **AND** the UP and DOWN controls become enabled

### Requirement: Live feed reconnects automatically
When the live market connection closes or fails, the UI SHALL indicate that it is reconnecting and SHALL retry automatically, with increasing delays between attempts up to a bounded maximum, until a connection succeeds. Live price, chart and live prediction feedback resume once data flows again.

#### Scenario: Connection lost and recovered
- **WHEN** the live market connection drops
- **THEN** the UI indicates that it is reconnecting
- **AND** reconnection is attempted without any player action
- **AND** when valid market events arrive again the displayed price and chart resume updating

### Requirement: Live feed failures never change game state
A live-feed failure in the browser SHALL NOT cancel, settle or alter a prediction, and SHALL NOT change the score or statistics.

#### Scenario: Feed fails during an active prediction
- **GIVEN** the player has a pending prediction
- **WHEN** the live market connection drops and later recovers
- **THEN** the same prediction is still pending with the same entry price and eligibility time, or has been settled by the server according to the settlement rules
- **AND** no score change happened because of the connection failure

### Requirement: Rolling chart of recent prices
The UI SHALL display a chart of live BTC/USD observations over a rolling time window (configurable, default 2 minutes). New observations are appended without resetting the chart, and observations older than the window drop out of view.

#### Scenario: New observation extends the chart
- **GIVEN** the chart shows recent observations
- **WHEN** a new valid market event arrives
- **THEN** the chart includes the new observation and keeps the earlier observations that are still inside the window

#### Scenario: Old observations leave the window
- **GIVEN** a configured window of 2 minutes
- **WHEN** an observation becomes older than 2 minutes
- **THEN** it is no longer shown on the chart

### Requirement: Chart window is a deployment setting from 60 seconds to 10 minutes
The length of time the chart shows SHALL be set per deployment, not by the player. It defaults to 2 minutes. A configured window shorter than 60 seconds or longer than 10 minutes SHALL be rejected as invalid configuration at start-up instead of being used.

#### Scenario: Default window
- **GIVEN** no chart window is configured
- **WHEN** the player opens the game
- **THEN** the chart shows the last 2 minutes, and its accessible description says so

#### Scenario: Configured window
- **GIVEN** the configured chart window is 5 minutes
- **WHEN** the player opens the game
- **THEN** the chart shows the last 5 minutes, and its accessible description says so

#### Scenario: Window at the limits
- **WHEN** the configured chart window is exactly 60 seconds or exactly 10 minutes
- **THEN** the configuration is accepted

#### Scenario: Window outside the limits is rejected
- **WHEN** the configured chart window is shorter than 60 seconds or longer than 10 minutes
- **THEN** the system refuses the configuration with a configuration error and does not use it

#### Scenario: Chart before enough data
- **WHEN** fewer than two observations have been received since the page loaded
- **THEN** the chart area shows that recent price data is being collected, instead of an empty or broken chart

#### Scenario: Chart has a text alternative
- **WHEN** an assistive-technology user reaches the chart
- **THEN** the chart exposes an accessible description that summarises it (for example, the time window and the latest price)

### Requirement: Chart moves smoothly with time
While the page is visible and the user has not asked for reduced motion, the chart's time window SHALL move forward continuously, redrawn at the browser's display frame rate rather than in one-second steps. The chart SHALL NOT tween between data sets: the line never wobbles or morphs from one shape to another.

#### Scenario: Chart moves between market events
- **GIVEN** the chart shows at least two observations and live data is fresh
- **WHEN** one second passes
- **THEN** the chart is redrawn many times during that second (at least 20 times on a 60 Hz display), not once

#### Scenario: Time labels move with the line
- **WHEN** the chart moves forward
- **THEN** the time-axis labels are at round clock times and move left with the line
- **AND** a label keeps its text for as long as it is visible

### Requirement: Chart line ends at the latest received price
While live data is fresh, the right-hand end of the chart line SHALL be at the currently displayed price. While live data is stale, the line SHALL end at the last price received. The chart SHALL NOT show any price that was not received.

#### Scenario: Line ends at the displayed price
- **GIVEN** live data is fresh
- **WHEN** two valid market events arrive less than one second apart
- **THEN** the latest price shown by the chart, including its accessible description, equals the displayed price after the second event

#### Scenario: Stale data is not extended
- **GIVEN** live data has become stale
- **WHEN** time passes without a valid market event
- **THEN** the line ends at the last price received, and the time window keeps moving

### Requirement: Price scale stays steady
The chart's price axis SHALL use round-number labels at an even step (1, 2 or 5 times a power of ten, in US dollars, never less than $1). It SHALL change its range only when needed. It expands as soon as a plotted price or the entry reference would fall outside it. It contracts only when the visible prices and the entry reference fill less than half of it. A new price inside the current range SHALL NOT change the price-axis labels.

#### Scenario: Small move keeps the scale
- **GIVEN** the chart shows price-axis labels
- **WHEN** a valid market event reports a price inside the current range
- **THEN** the price-axis labels are unchanged

#### Scenario: Breakout expands the scale
- **WHEN** a valid market event reports a price outside the current range
- **THEN** the range expands so that the whole line is visible, not clipped
- **AND** the labels are still round numbers at an even step

#### Scenario: Scale contracts after a spike leaves the window
- **GIVEN** the range was expanded for a price spike
- **WHEN** the spike leaves the time window and the remaining prices fill less than half of the range
- **THEN** the range contracts to fit the remaining prices

#### Scenario: Flat market
- **WHEN** every visible price is the same
- **THEN** the line is drawn inside the range, not on its top or bottom edge
