import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Observation } from "../hooks/useMarketFeed.ts";
import { PriceChart } from "./PriceChart.tsx";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

const obs = (secondsAgo: number, cents: number) => ({ t: NOW - secondsAgo * 1000, cents });

/** A fresh feed whose latest price is the last observation. */
function Chart(props: { observations: Observation[]; windowSeconds: number; entryPrice?: number }) {
  const last = props.observations.at(-1);
  return <PriceChart {...props} priceCents={last?.cents ?? null} priceAt={last?.t ?? null} fresh />;
}

describe("PriceChart", () => {
  it("shows a collecting state, not an empty chart, with fewer than two observations", () => {
    const { rerender } = render(<Chart observations={[]} windowSeconds={300} />);
    expect(screen.getByText(/collecting recent price data/i)).toBeInTheDocument();

    rerender(<Chart observations={[obs(1, 6_750_000)]} windowSeconds={300} />);
    expect(screen.getByText(/collecting recent price data/i)).toBeInTheDocument();
  });

  it("keeps collecting until two sampled observations, but describes the latest received price", () => {
    render(
      <PriceChart
        observations={[obs(2, 6_750_000)]}
        priceCents={6_750_342}
        priceAt={NOW - 500}
        fresh
        windowSeconds={300}
      />,
    );
    expect(screen.getByText(/collecting recent price data/i)).toBeInTheDocument();
    expect(screen.getByRole("figure")).toHaveAccessibleName(/\$67,503\.42/);
  });

  it("is a figure with an accessible summary of the window and latest price", () => {
    render(<Chart observations={[obs(2, 6_750_000), obs(1, 6_750_342)]} windowSeconds={300} />);
    const figure = screen.getByRole("figure");
    expect(figure).toHaveAccessibleName(/last 5 minutes.*\$67,503\.42/);
    expect(screen.queryByText(/collecting recent price data/i)).not.toBeInTheDocument();
  });

  it("summarises the window in the configured length", () => {
    render(<Chart observations={[]} windowSeconds={90} />);
    expect(screen.getByRole("figure")).toHaveAccessibleName(/last 90 seconds/);
  });

  it("drops observations that leave the window", () => {
    render(
      <Chart
        observations={[obs(301, 6_000_000), obs(200, 6_750_000), obs(100, 6_760_000)]}
        windowSeconds={300}
      />,
    );
    // The 301-second-old observation is already outside the window.
    expect(screen.getByRole("figure")).toHaveAccessibleName(/\$67,600\.00/);

    act(() => {
      vi.advanceTimersByTime(150_000); // the 200 s observation ages out; only one remains
    });
    expect(screen.getByText(/collecting recent price data/i)).toBeInTheDocument();
    expect(screen.getByRole("figure")).toHaveAccessibleName(/\$67,600\.00/);

    act(() => {
      vi.advanceTimersByTime(200_000);
    });
    expect(screen.getByRole("figure")).toHaveAccessibleName(/no data yet/i);
  });

  it("labels the entry-price reference line with the entry price", () => {
    render(
      <Chart
        observations={[obs(2, 6_750_000), obs(1, 6_750_100)]}
        windowSeconds={300}
        entryPrice={67_500}
      />,
    );
    expect(within(screen.getByRole("figure")).getByText("$67,500.00")).toBeInTheDocument();
  });

  it("shows no entry reference without an active prediction", () => {
    render(<Chart observations={[obs(2, 6_750_000), obs(1, 6_750_100)]} windowSeconds={300} />);
    expect(within(screen.getByRole("figure")).queryByText("$67,500.00")).not.toBeInTheDocument();
  });
});
