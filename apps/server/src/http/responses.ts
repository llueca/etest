import type { Context as HonoContext } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Response shapes shared by every route (design D7).

/** Every response, errors included, carries the server clock so clients can correct their own. */
export const ok = (c: HonoContext, body: object, status: ContentfulStatusCode = 200) =>
  c.json({ ...body, serverTime: new Date().toISOString() }, status);

export const fail = (c: HonoContext, status: ContentfulStatusCode, code: string, message: string) =>
  ok(c, { error: { code, message } }, status);

export const unauthorized = (c: HonoContext) =>
  fail(c, 401, "unauthorized", "A valid player credential is required.");
