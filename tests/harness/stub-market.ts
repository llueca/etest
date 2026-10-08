import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type WebSocket, WebSocketServer } from "ws";

// Stub of the Coinbase Exchange market data used by the app:
//   REST  GET  /products/:id/ticker   (server: entry and settlement prices)
//   WS    /ws  `ticker` channel       (browser: live price)
// Both follow the Coinbase wire shapes. Behaviour is controlled through the
// StubMarket object (in-process) or the HTTP control API (`/__control`), so
// the same stub serves contract tests and Playwright tests.

export type RestFailure = "none" | "error" | "hang";

export interface StubMarketState {
  /** Decimal string exactly as Coinbase sends it, e.g. "67500.00". */
  price: string;
  /** Delay before every REST ticker answer. */
  restDelayMs: number;
  /** "error" answers 503; "hang" never answers. */
  restFailure: RestFailure;
  /** While true, the WebSocket stays connected but emits no ticks. */
  silent: boolean;
  /** While true, new WebSocket connections are refused. */
  refuseConnections: boolean;
  /** Interval of automatic ticks carrying the current price. */
  tickIntervalMs: number;
}

export type ControlPatch = Partial<StubMarketState> & {
  /** Also empty the stack's players table (needs StubMarket.onReset; used by StubMarketControl.reset). */
  resetStack?: boolean;
  /** Close every open WebSocket connection now. */
  drop?: boolean;
  /** Send one raw WebSocket message to every client (e.g. malformed input). */
  emitRaw?: string;
};

export interface StubMarket {
  restUrl: string;
  wsUrl: string;
  controlUrl: string;
  productId: string;
  /** Called when a control request asks for `resetStack`; the stack fixture sets it. */
  onReset?: () => Promise<void> | void;
  /** Number of REST ticker requests received (answered or not). */
  readonly restRequests: number;
  state: Readonly<StubMarketState>;
  update(patch: ControlPatch): void;
  setPrice(price: string): void;
  /** Send one ticker message with the current price (or `price`) to every client now. */
  emitTick(price?: string): void;
  close(): Promise<void>;
}

function tickerMessage(productId: string, price: string, sequence: number) {
  return {
    type: "ticker",
    sequence,
    product_id: productId,
    price,
    open_24h: price,
    volume_24h: "1000.00000000",
    low_24h: price,
    high_24h: price,
    volume_30d: "30000.00000000",
    best_bid: price,
    best_bid_size: "0.01000000",
    best_ask: price,
    best_ask_size: "0.01000000",
    side: "buy",
    time: new Date().toISOString(),
    trade_id: sequence,
    last_size: "0.00100000",
  };
}

export async function startStubMarket(
  options: { port?: number; productId?: string; initialPrice?: string } = {},
): Promise<StubMarket> {
  const productId = options.productId ?? "BTC-USD";
  const state: StubMarketState = {
    price: options.initialPrice ?? "67500.00",
    restDelayMs: 0,
    restFailure: "none",
    silent: false,
    refuseConnections: false,
    tickIntervalMs: 250,
  };
  let restRequests = 0;
  let sequence = 0;
  const sockets = new Set<WebSocket>();
  const hanging = new Set<() => void>();

  const wss = new WebSocketServer({ noServer: true });
  const sendToAll = (text: string) => {
    for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(text);
  };
  const emitTick = (price = state.price) =>
    sendToAll(JSON.stringify(tickerMessage(productId, price, ++sequence)));

  let timer = setInterval(() => !state.silent && emitTick(), state.tickIntervalMs);

  const update = (patch: ControlPatch) => {
    const { drop, emitRaw, resetStack: _resetStack, ...rest } = patch;
    Object.assign(state, rest);
    if (rest.tickIntervalMs !== undefined) {
      clearInterval(timer);
      timer = setInterval(() => !state.silent && emitTick(), state.tickIntervalMs);
    }
    if (emitRaw !== undefined) sendToAll(emitRaw);
    if (drop) for (const socket of sockets) socket.terminate();
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => resolve(body));
    });

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    if (url.pathname === "/__control") {
      if (req.method === "POST") {
        const patch: ControlPatch = JSON.parse((await readBody(req)) || "{}");
        update(patch);
        if (patch.resetStack) await market.onReset?.();
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ...state, restRequests }));
      return;
    }
    if (url.pathname === `/products/${productId}/ticker`) {
      restRequests++;
      if (state.restFailure === "hang") {
        hanging.add(() => res.destroy());
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, state.restDelayMs));
      if (state.restFailure === "error") {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "stub market unavailable" }));
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          trade_id: ++sequence,
          price: state.price,
          size: "0.00100000",
          time: new Date().toISOString(),
          bid: state.price,
          ask: state.price,
          volume: "1000.00000000",
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://stub").pathname !== "/ws" || state.refuseConnections) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.on("close", () => sockets.delete(ws));
      ws.on("message", (data) => {
        const message = JSON.parse(String(data));
        if (message.type === "subscribe") {
          ws.send(
            JSON.stringify({
              type: "subscriptions",
              channels: [{ name: "ticker", product_ids: [productId] }],
            }),
          );
          if (!state.silent)
            ws.send(JSON.stringify(tickerMessage(productId, state.price, ++sequence)));
        }
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `127.0.0.1:${port}`;

  const market: StubMarket = {
    restUrl: `http://${base}`,
    wsUrl: `ws://${base}/ws`,
    controlUrl: `http://${base}/__control`,
    productId,
    get restRequests() {
      return restRequests;
    },
    state,
    update,
    setPrice: (price) => update({ price }),
    emitTick,
    close: async () => {
      clearInterval(timer);
      for (const socket of sockets) socket.terminate();
      for (const release of hanging) release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  return market;
}

/** Controls a stub running in another process (e.g. the Playwright web server) over HTTP. */
export class StubMarketControl {
  constructor(private readonly controlUrl: string) {}

  async update(patch: ControlPatch): Promise<StubMarketState & { restRequests: number }> {
    const response = await fetch(this.controlUrl, { method: "POST", body: JSON.stringify(patch) });
    return response.json();
  }

  setPrice(price: string) {
    return this.update({ price });
  }

  /** Back to a quiet, healthy market at `price`, with an empty players table. */
  reset(price = "67500.00") {
    return this.update({
      resetStack: true,
      price,
      restDelayMs: 0,
      restFailure: "none",
      silent: false,
      refuseConnections: false,
    });
  }
}
