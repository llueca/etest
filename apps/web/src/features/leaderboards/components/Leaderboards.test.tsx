import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LeaderboardsResponse } from "../../../lib/api.ts";
import { player } from "../../../test/utils.ts";
import type { Leaderboards as LeaderboardsState } from "../hooks/useLeaderboards.ts";
import { Leaderboards } from "./Leaderboards.tsx";

const empty: LeaderboardsResponse = { score: { entries: [] }, predictor: { entries: [] } };

const board = (name: string) => screen.getByRole("region", { name });

function renderBoards(state: Partial<LeaderboardsState>, me: Record<string, unknown> = {}) {
  const retry = vi.fn();
  render(
    <Leaderboards
      leaderboards={{ data: null, status: "ready", retry, ...state }}
      player={player(me) as never}
    />,
  );
  return { retry };
}

describe("Leaderboards", () => {
  it("shows a loading state before the first data", () => {
    renderBoards({ status: "loading" });
    expect(screen.getByText(/loading leaderboards/i)).toBeInTheDocument();
  });

  it("shows an empty state on each board when no one is ranked", () => {
    renderBoards({ data: empty });
    expect(
      within(board("Score leaderboard")).getByText(/no one is ranked yet/i),
    ).toBeInTheDocument();
    expect(
      within(board("Predictor leaderboard")).getByText(/no one is ranked yet/i),
    ).toBeInTheDocument();
  });

  it("shows a retryable error that does not need the boards", async () => {
    const { retry } = renderBoards({ status: "error" });
    expect(screen.getByText(/could not load the leaderboards/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the previous boards, with an error and retry, when a reload fails", () => {
    renderBoards({
      status: "error",
      data: {
        score: {
          entries: [{ position: 1, displayName: "Charlie", score: 9, isCurrentPlayer: false }],
        },
        predictor: { entries: [] },
      },
    });
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("marks the current player's row with a visible You label", () => {
    renderBoards(
      {
        data: {
          score: {
            entries: [
              { position: 1, displayName: "Charlie", score: 9, isCurrentPlayer: false },
              { position: 2, displayName: "Dario", score: 8, isCurrentPlayer: true },
            ],
          },
          predictor: { entries: [] },
        },
      },
      { gamesPlayed: 8, wins: 8, score: 8 },
    );
    const rows = within(board("Score leaderboard")).getAllByRole("listitem");
    expect(within(rows[0] as HTMLElement).queryByText("You")).not.toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("You")).toBeVisible();
    // Already listed: no separate own-value line.
    expect(screen.queryByText(/your score/i)).not.toBeInTheDocument();
  });

  it("shows the player's own values below the list when they are outside the top entries", () => {
    renderBoards(
      {
        data: {
          score: {
            entries: [{ position: 1, displayName: "Charlie", score: 9, isCurrentPlayer: false }],
          },
          predictor: {
            entries: [
              {
                position: 1,
                displayName: "Charlie",
                adjustedAccuracy: 0.7727,
                accuracy: 0.8,
                gamesPlayed: 100,
                isCurrentPlayer: false,
              },
            ],
          },
        },
      },
      { score: 3, wins: 3, losses: 0, gamesPlayed: 3, accuracy: 1, adjustedAccuracy: 8 / 13 },
    );
    expect(within(board("Score leaderboard")).getByText("Your score: 3")).toBeInTheDocument();
    expect(
      within(board("Predictor leaderboard")).getByText(
        /Your adjusted accuracy: 61\.5% · raw 100% · 3 games/,
      ),
    ).toBeInTheDocument();
  });

  it("explains how to get ranked to a player without settled predictions", () => {
    renderBoards({ data: empty }, { gamesPlayed: 0 });
    expect(
      screen.getByText(/complete a prediction to get onto the leaderboards/i),
    ).toBeInTheDocument();
  });

  it("does not show the not-yet-eligible note once the player has settled predictions", () => {
    renderBoards({ data: empty }, { gamesPlayed: 1 });
    expect(screen.queryByText(/complete a prediction/i)).not.toBeInTheDocument();
  });

  it("formats predictor rows: adjusted accuracy to one decimal, raw as whole percent, games played", () => {
    renderBoards({
      data: {
        score: { entries: [] },
        predictor: {
          entries: [
            {
              position: 1,
              displayName: "Bea",
              adjustedAccuracy: 8 / 13,
              accuracy: 1,
              gamesPlayed: 3,
              isCurrentPlayer: false,
            },
          ],
        },
      },
    });
    const row = within(board("Predictor leaderboard")).getByRole("listitem");
    expect(within(row).getByText("61.5%")).toBeInTheDocument();
    expect(within(row).getByText("100%")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(row).toHaveTextContent("Bea");
  });
});
