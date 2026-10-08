import type { Context as HonoContext } from "hono";
import type { Context } from "../context.ts";
import type { PlayerItem } from "../db/player-item.ts";
import { getPlayer } from "../features/players/store.ts";

/** The bearer token is the player's identifier. */
export const bearerToken = (c: HonoContext) =>
  /^Bearer (\S{1,128})$/.exec(c.req.header("authorization") ?? "")?.[1];

export async function authenticate(ctx: Context, c: HonoContext): Promise<PlayerItem | undefined> {
  const token = bearerToken(c);
  return token ? getPlayer(ctx, token) : undefined;
}
