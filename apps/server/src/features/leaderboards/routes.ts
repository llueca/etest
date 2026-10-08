import { deriveStats } from "@btc/shared/domain";
import type { Hono } from "hono";
import type { Context } from "../../context.ts";
import { bearerToken } from "../../http/auth.ts";
import { ok } from "../../http/responses.ts";
import { topPlayers } from "./store.ts";

export function registerLeaderboardRoutes(app: Hono, ctx: Context): void {
  // Public. The bearer is optional and only marks the caller's own row; no identifier is returned.
  app.get("/api/leaderboards", async (c) => {
    const me = bearerToken(c);
    const [byScore, byAccuracy] = await Promise.all([
      topPlayers(ctx, "score-lb"),
      topPlayers(ctx, "accuracy-lb"),
    ]);
    return ok(c, {
      score: {
        entries: byScore.map((p, index) => ({
          position: index + 1,
          displayName: p.displayName,
          score: p.score,
          isCurrentPlayer: p.playerId === me,
        })),
      },
      predictor: {
        entries: byAccuracy.map((p, index) => {
          const { accuracy, adjustedAccuracy, gamesPlayed } = deriveStats(p);
          return {
            position: index + 1,
            displayName: p.displayName,
            adjustedAccuracy,
            accuracy,
            gamesPlayed,
            isCurrentPlayer: p.playerId === me,
          };
        }),
      },
    });
  });
}
