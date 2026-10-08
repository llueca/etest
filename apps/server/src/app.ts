import { Hono } from "hono";
import type { Context } from "./context.ts";
import { registerLeaderboardRoutes } from "./features/leaderboards/routes.ts";
import { registerPlayerRoutes } from "./features/players/routes.ts";
import { registerPredictionRoutes } from "./features/predictions/routes.ts";
import { fail } from "./http/responses.ts";

/** The whole HTTP API (design D7). Runs unchanged on Lambda and on the local dev server. */
export function createApp(ctx: Context): Hono {
  const app = new Hono();

  registerPlayerRoutes(app, ctx);
  registerPredictionRoutes(app, ctx);
  registerLeaderboardRoutes(app, ctx);

  app.all("/api/*", (c) => fail(c, 404, "not_found", "No such API route."));

  app.onError((error, c) => {
    console.error(JSON.stringify({ level: "error", message: error.message, stack: error.stack }));
    return fail(c, 500, "internal_error", "Something went wrong.");
  });

  return app;
}
