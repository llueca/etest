import { parsePriceToCents } from "@btc/shared/domain";
import { useEffect, useRef, useState } from "react";
import type { WebConfig } from "../../../lib/config.ts";

export interface Observation {
  /** Epoch ms when the observation was recorded. */
  t: number;
  cents: number;
}

export type Connection = "connecting" | "open" | "reconnecting";

export interface MarketFeed {
  /** Last valid price in cents, or null before the first valid event. */
  priceCents: number | null;
  /** Epoch ms when that price was received, or null before the first valid event. */
  priceAt: number | null;
  /** A valid event arrived within the stale threshold. */
  fresh: boolean;
  connection: Connection;
  /** Valid prices sampled at most once per second, for the chart. */
  observations: Observation[];
}

type FeedConfig = Pick<
  WebConfig,
  "marketWsUrl" | "marketProductId" | "staleThresholdMs" | "chartWindowSeconds"
>;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const SAMPLE_INTERVAL_MS = 1_000;

/** The valid price in cents carried by a raw message, or null (design: invalid messages are ignored). */
function priceFromMessage(raw: unknown, productId: string): number | null {
  let message: { type?: unknown; product_id?: unknown; price?: unknown };
  try {
    message = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (message?.type !== "ticker" || message.product_id !== productId) return null;
  const { price } = message;
  if (typeof price !== "string" && typeof price !== "number") return null;
  return parsePriceToCents(String(price));
}

/**
 * Owns the Coinbase WebSocket: parsing, staleness, reconnection with exponential
 * backoff and a rolling observation buffer. Renders are batched to one per animation frame.
 */
export function useMarketFeed(config: FeedConfig): MarketFeed {
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceAt, setPriceAt] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [observations, setObservations] = useState<Observation[]>([]);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const { marketWsUrl, marketProductId, staleThresholdMs, chartWindowSeconds } =
      configRef.current;
    let socket: WebSocket | undefined;
    let stopped = false;
    let backoffMs = RECONNECT_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let latest: Observation | null = null;
    let lastSampleAt = Number.NEGATIVE_INFINITY;

    const flush = () => {
      frame = undefined;
      if (latest !== null) {
        setPriceCents(latest.cents);
        setPriceAt(latest.t);
      }
      latest = null;
    };

    const onValidPrice = (cents: number) => {
      const now = Date.now();
      latest = { t: now, cents };
      frame ??= requestAnimationFrame(flush);
      setFresh(true);
      clearTimeout(staleTimer);
      staleTimer = setTimeout(() => setFresh(false), staleThresholdMs);
      backoffMs = RECONNECT_MIN_MS;
      if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
        lastSampleAt = now;
        const oldest = now - chartWindowSeconds * 1000;
        setObservations((previous) => [
          ...previous.filter((o) => o.t >= oldest),
          { t: now, cents },
        ]);
      }
    };

    const connect = () => {
      socket = new WebSocket(marketWsUrl);
      socket.onopen = () => {
        setConnection("open");
        socket?.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: [marketProductId],
            channels: ["ticker"],
          }),
        );
      };
      socket.onmessage = (event) => {
        const cents = priceFromMessage(event.data, marketProductId);
        if (cents !== null) onValidPrice(cents);
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnection("reconnecting");
        retryTimer = setTimeout(connect, backoffMs);
        backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      };
      // A failed attempt is always followed by close, which schedules the retry.
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(staleTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  return { priceCents, priceAt, fresh, connection, observations };
}
