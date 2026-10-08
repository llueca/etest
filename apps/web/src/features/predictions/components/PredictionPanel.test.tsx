import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PredictionView, ResultView } from "../../../lib/api.ts";
import { PredictionPanel } from "./PredictionPanel.tsx";

const SERVER_NOW = new Date("2026-01-01T20:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SERVER_NOW);
});

const prediction = (overrides: Partial<PredictionView> = {}): PredictionView => ({
  id: "p1",
  direction: "up",
  entryPrice: 67_500,
  createdAt: SERVER_NOW - 37_000,
  eligibleAt: SERVER_NOW + 23_000,
  status: "pending",
  ...overrides,
});

const result = (overrides: Partial<ResultView> = {}): ResultView => ({
  id: "p0",
  direction: "up",
  entryPrice: 67_500,
  createdAt: SERVER_NOW - 120_000,
  eligibleAt: SERVER_NOW - 60_000,
  status: "won",
  settlementPrice: 67_540,
  settledAt: SERVER_NOW - 59_000,
  scoreDelta: 1,
  scoreBefore: 6,
  scoreAfter: 7,
  ...overrides,
});

function panel(overrides: Partial<Parameters<typeof PredictionPanel>[0]> = {}) {
  return (
    <PredictionPanel
      active={null}
      result={null}
      offsetMs={0}
      livePriceCents={null}
      predictionError={false}
      unconfirmed={false}
      feedAnnouncement=""
      resolvePollIntervalMs={2_000}
      predictionWindowSeconds={60}
      onResolvePoll={vi.fn()}
      onConfirm={vi.fn()}
      {...overrides}
    />
  );
}

describe("countdown", () => {
  it("shows the whole seconds left until eligibleAt", () => {
    render(panel({ active: prediction() }));
    expect(screen.getByText("Time left: 23 seconds")).toBeInTheDocument();
  });

  it("rounds up and counts down with the clock", () => {
    render(panel({ active: prediction({ eligibleAt: SERVER_NOW + 22_100 }) }));
    expect(screen.getByText("Time left: 23 seconds")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_250); // the display ticks every 250 ms
    });
    expect(screen.getByText("Time left: 21 seconds")).toBeInTheDocument();
  });

  it("uses the server clock when the device clock is 30 s ahead", () => {
    vi.setSystemTime(SERVER_NOW + 30_000); // device clock is wrong
    render(panel({ active: prediction(), offsetMs: -30_000 }));
    expect(screen.getByText("Time left: 23 seconds")).toBeInTheDocument();
  });

  it("shows Resolving… at zero and never a negative or zero time", () => {
    render(panel({ active: prediction() }));
    act(() => {
      vi.advanceTimersByTime(23_000);
    });
    expect(screen.getByText("Resolving…")).toBeInTheDocument();
    expect(screen.queryByText(/time left/i)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Resolving…")).toBeInTheDocument();
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument();
  });

  it("resumes the correct countdown for a restored prediction", () => {
    render(panel({ active: prediction({ eligibleAt: SERVER_NOW + 10_000 }) }));
    expect(screen.getByText("Time left: 10 seconds")).toBeInTheDocument();
  });
});

describe("live status", () => {
  it.each([
    ["up", 6_750_001, "WINNING"],
    ["up", 6_749_999, "LOSING"],
    ["up", 6_750_000, "TIED"],
    ["down", 6_749_999, "WINNING"],
    ["down", 6_750_001, "LOSING"],
    ["down", 6_750_000, "TIED"],
  ] as const)(
    "%s prediction at live %i cents is %s (one cent counts)",
    (direction, live, status) => {
      render(panel({ active: prediction({ direction }), livePriceCents: live }));
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );

  it("says live status is unavailable, instead of a stale status, without fresh data", () => {
    render(panel({ active: prediction(), livePriceCents: null }));
    expect(screen.getByText("Live status unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/WINNING|LOSING|TIED/)).not.toBeInTheDocument();
    // The countdown keeps going.
    expect(screen.getByText("Time left: 23 seconds")).toBeInTheDocument();
  });

  it("shows the direction and the authoritative entry price", () => {
    render(panel({ active: prediction({ direction: "down", entryPrice: 67_501.1 }) }));
    expect(screen.getByText("DOWN")).toBeInTheDocument();
    expect(screen.getByText("Entry price: $67,501.10")).toBeInTheDocument();
  });
});

describe("results and invitation", () => {
  it("shows a WIN with direction, prices, +1 and the score change", () => {
    render(panel({ result: result() }));
    expect(screen.getByText("WIN")).toBeInTheDocument();
    expect(screen.getByText("UP")).toBeInTheDocument();
    expect(screen.getByText("$67,500.00 → $67,540.00")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("Score: 6 → 7")).toBeInTheDocument();
  });

  it("shows a LOSS with -1 and the score change", () => {
    render(
      panel({
        result: result({ status: "lost", settlementPrice: 67_480, scoreDelta: -1, scoreAfter: 5 }),
      }),
    );
    expect(screen.getByText("LOSS")).toBeInTheDocument();
    expect(screen.getByText("$67,500.00 → $67,480.00")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByText("Score: 6 → 5")).toBeInTheDocument();
  });

  it.each([
    [60, "1 minute"],
    [90, "90 seconds"],
    [120, "2 minutes"],
  ])("states a configured %i-second window in the invitation", (seconds, text) => {
    render(panel({ predictionWindowSeconds: seconds }));
    expect(screen.getByText(/make your first prediction/i)).toHaveTextContent(`after ${text}`);
  });

  it("invites a new player to make a first prediction and shows no result", () => {
    render(panel());
    expect(screen.getByText(/make your first prediction/i)).toBeInTheDocument();
    expect(screen.queryByText(/WIN|LOSS/)).not.toBeInTheDocument();
  });

  it("replaces the result with the active prediction", () => {
    const { rerender } = render(panel({ result: result() }));
    expect(screen.getByText("WIN")).toBeInTheDocument();
    rerender(panel({ result: null, active: prediction() }));
    expect(screen.queryByText("WIN")).not.toBeInTheDocument();
    expect(screen.getByText(/your prediction/i)).toBeInTheDocument();
  });

  it("shows a retryable error when a prediction could not be started", () => {
    render(panel({ predictionError: true }));
    expect(screen.getByText(/could not start your prediction.*try again/i)).toBeInTheDocument();
  });
});

describe("resolving poll", () => {
  it("does not poll before eligibility, polls while Resolving…, and stops once settled", () => {
    const onResolvePoll = vi.fn();
    const { rerender } = render(panel({ active: prediction(), onResolvePoll }));

    act(() => {
      vi.advanceTimersByTime(22_000);
    });
    expect(onResolvePoll).not.toHaveBeenCalled();

    // Reaching eligibleAt renders Resolving…, which starts the poll.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("Resolving…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2_000 * 3);
    });
    expect(onResolvePoll).toHaveBeenCalledTimes(3);

    // The server settled the prediction: the panel now shows the result.
    rerender(panel({ active: null, result: result(), onResolvePoll }));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onResolvePoll).toHaveBeenCalledTimes(3);
  });
});
