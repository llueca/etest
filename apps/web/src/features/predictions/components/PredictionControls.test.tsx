import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceDisplay } from "../../market/components/PriceDisplay.tsx";
import type { MarketFeed } from "../../market/hooks/useMarketFeed.ts";
import { PredictionControls } from "./PredictionControls.tsx";

const up = () => screen.getByRole("button", { name: /\bUP\b/ });
const down = () => screen.getByRole("button", { name: /\bDOWN\b/ });

const props = {
  hasActivePrediction: false,
  submitting: false,
  unconfirmed: false,
  feedFresh: true,
  onPredict: vi.fn(),
};

describe("PredictionControls", () => {
  it("exposes native buttons named so the direction is clear, enabled when nothing blocks them", () => {
    render(<PredictionControls {...props} />);
    expect(screen.getByRole("button", { name: "Predict higher (UP)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Predict lower (DOWN)" })).toBeEnabled();
  });

  it("is disabled during an active prediction, with the reason as text and as the description", () => {
    render(<PredictionControls {...props} hasActivePrediction />);
    for (const button of [up(), down()]) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("A prediction is in progress.");
    }
    expect(screen.getByText("A prediction is in progress.")).toBeVisible();
  });

  it("is disabled while a request is in flight, with the reason", () => {
    render(<PredictionControls {...props} submitting />);
    expect(up()).toBeDisabled();
    expect(down()).toHaveAccessibleDescription("Starting your prediction…");
  });

  it.each([
    ["connecting", { priceCents: null, fresh: false, connection: "connecting" }, /connecting/i],
    ["stale", { priceCents: 6_750_000, fresh: false, connection: "open" }, /stale/i],
    [
      "reconnecting",
      { priceCents: null, fresh: false, connection: "reconnecting" },
      /reconnecting/i,
    ],
  ] as const)(
    "is disabled while live data is %s, described by the feed status",
    (_, state, reason) => {
      const feed: MarketFeed = { observations: [], priceAt: null, ...state };
      render(
        <>
          <PriceDisplay feed={feed} />
          <PredictionControls {...props} feedFresh={false} />
        </>,
      );
      expect(up()).toBeDisabled();
      expect(down()).toBeDisabled();
      expect(up()).toHaveAccessibleDescription(reason);
    },
  );

  it("marks a stale last price as not live and never shows a placeholder price as real", () => {
    const { rerender } = render(
      <PriceDisplay
        feed={{
          priceCents: null,
          fresh: false,
          connection: "connecting",
          observations: [],
          priceAt: null,
        }}
      />,
    );
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();

    rerender(
      <PriceDisplay
        feed={{
          priceCents: 6_750_000,
          fresh: false,
          connection: "open",
          observations: [],
          priceAt: null,
        }}
      />,
    );
    expect(screen.getByText("$67,500.00")).toHaveClass("price--stale");
    expect(screen.getByText(/stale/i)).toBeVisible();
  });
});
