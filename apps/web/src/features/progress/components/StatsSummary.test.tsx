import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { player } from "../../../test/utils.ts";
import { StatsSummary } from "./StatsSummary.tsx";

/** Each statistic is one list item; compare its full text, e.g. "Score: 0". */
function statLines(overrides: Record<string, unknown>): string[] {
  render(<StatsSummary player={player(overrides) as never} />);
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

describe("StatsSummary", () => {
  it("shows whole-percent accuracy: 7 wins and 3 losses is 70%", () => {
    const lines = statLines({ wins: 7, losses: 3, gamesPlayed: 10, accuracy: 0.7, score: 4 });
    expect(lines).toContain("Accuracy: 70%");
    expect(lines).toContain("Games played: 10");
  });

  it("rounds to the nearest integer: 2 wins and 1 loss is 67%", () => {
    expect(statLines({ wins: 2, losses: 1, gamesPlayed: 3, accuracy: 2 / 3 })).toContain(
      "Accuracy: 67%",
    );
  });

  it("shows a dash and zeros for a new player", () => {
    expect(statLines({})).toEqual([
      "Score: 0",
      "Games played: 0",
      "Wins: 0",
      "Losses: 0",
      "Accuracy: —",
      "Current streak: 0",
      "Best streak: 0",
    ]);
  });

  it("shows current and best streak and a negative score", () => {
    const lines = statLines({ score: -2, currentStreak: 0, bestStreak: 3 });
    expect(lines).toContain("Score: -2");
    expect(lines).toContain("Best streak: 3");
  });
});
