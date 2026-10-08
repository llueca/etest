import { vi } from "vitest";

/** Controllable stand-in for the browser WebSocket used by the market feed. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static install() {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  }
  static get latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("no WebSocket was created");
    return socket;
  }

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }
  message(payload: unknown) {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }
  /** The connection fails or closes. */
  drop() {
    this.onclose?.();
  }
}

export const ticker = (price: string | number | undefined, productId = "BTC-USD") => ({
  type: "ticker",
  product_id: productId,
  ...(price === undefined ? {} : { price }),
});

export const feedConfig = {
  marketWsUrl: "ws://market.test/ws",
  marketProductId: "BTC-USD",
  staleThresholdMs: 10_000,
  chartWindowSeconds: 300,
};

export const webConfig = {
  ...feedConfig,
  nameMaxLength: 24,
  resolvePollIntervalMs: 2_000,
  predictionWindowSeconds: 60,
};

type Handler = (request: { body: unknown; token?: string }) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const withServerTime = (body: object) => ({ ...body, serverTime: new Date().toISOString() });

export const player = (overrides: Record<string, unknown> = {}) => ({
  displayName: "Player-0001",
  score: 0,
  wins: 0,
  losses: 0,
  gamesPlayed: 0,
  accuracy: null,
  adjustedAccuracy: 0.5,
  currentStreak: 0,
  bestStreak: 0,
  ...overrides,
});

/**
 * Stubs `fetch` with "METHOD /path" routes. Unlisted routes fail the test
 * loudly instead of silently succeeding. Returns the call log.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { route: string; body: unknown; token?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const route = `${init.method ?? "GET"} ${new URL(input, "http://app.test").pathname}`;
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      const authorization = (init.headers as Record<string, string> | undefined)?.authorization;
      const token = authorization?.replace("Bearer ", "");
      calls.push({ route, body, token });
      const handler = routes[route];
      if (!handler) throw new Error(`unexpected request: ${route}`);
      return handler({ body, token });
    }),
  );
  return calls;
}
