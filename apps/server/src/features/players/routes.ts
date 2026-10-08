import { validateDisplayName } from "@btc/shared/domain";
import type { Hono } from "hono";
import type { Context } from "../../context.ts";
import { authenticate } from "../../http/auth.ts";
import { fail, ok, unauthorized } from "../../http/responses.ts";
import { lastResultView, predictionView } from "../predictions/views.ts";
import { createPlayer, renamePlayer } from "./store.ts";
import { playerView } from "./views.ts";

export function registerPlayerRoutes(app: Hono, ctx: Context): void {
  app.post("/api/players", async (c) => {
    const player = await createPlayer(ctx, Date.now());
    return ok(c, { playerId: player.playerId, player: playerView(player) }, 201);
  });

  app.get("/api/me", async (c) => {
    const player = await authenticate(ctx, c);
    if (!player) return unauthorized(c);
    return ok(c, {
      player: playerView(player),
      activePrediction: player.activePrediction ? predictionView(player.activePrediction) : null,
      lastResult: player.lastResult ? lastResultView(player.lastResult) : null,
    });
  });

  app.patch("/api/me", async (c) => {
    const player = await authenticate(ctx, c);
    if (!player) return unauthorized(c);
    const body = await c.req.json().catch(() => undefined);
    const input = typeof body?.displayName === "string" ? body.displayName : "";
    const validation = validateDisplayName(input, ctx.config.nameMaxLength);
    if (!validation.ok) return fail(c, 400, "validation_failed", validation.reason);
    const renamed = await renamePlayer(ctx, player.playerId, validation.value);
    return ok(c, { player: playerView(renamed) });
  });
}
