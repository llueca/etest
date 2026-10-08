import type { Hono, Context as HonoContext } from "hono";
import type { Context } from "../../context.ts";
import { authenticate } from "../../http/auth.ts";
import { fail, ok, unauthorized } from "../../http/responses.ts";
import { fetchPriceCents, MarketUnavailableError } from "../../market/price.ts";
import { PredictionAlreadyActiveError, startPrediction } from "./store.ts";
import { predictionView } from "./views.ts";

const alreadyActive = (c: HonoContext) =>
  fail(c, 409, "prediction_already_active", "A prediction is already active.");

export function registerPredictionRoutes(app: Hono, ctx: Context): void {
  app.post("/api/me/predictions", async (c) => {
    const player = await authenticate(ctx, c);
    if (!player) return unauthorized(c);
    // Only the direction is read: price and timing are always the server's.
    const body = await c.req.json().catch(() => undefined);
    const direction = body?.direction;
    if (direction !== "up" && direction !== "down") {
      return fail(c, 400, "invalid_request", 'direction must be "up" or "down".');
    }
    // Already active: say so without asking the provider. The conditional write below
    // still decides races between concurrent requests.
    if (player.activePrediction) return alreadyActive(c);
    try {
      const entryPriceCents = await fetchPriceCents(ctx.config);
      const prediction = await startPrediction(
        ctx,
        player.playerId,
        direction,
        entryPriceCents,
        Date.now(),
        ctx.config.predictionWindowSeconds * 1000,
      );
      return ok(c, { prediction: predictionView(prediction) }, 201);
    } catch (error) {
      if (error instanceof PredictionAlreadyActiveError) return alreadyActive(c);
      if (error instanceof MarketUnavailableError) {
        console.error(
          JSON.stringify({ level: "warn", event: "price_unavailable", message: error.message }),
        );
        return fail(c, 503, "price_unavailable", "The current price is unavailable. Try again.");
      }
      throw error;
    }
  });
}
