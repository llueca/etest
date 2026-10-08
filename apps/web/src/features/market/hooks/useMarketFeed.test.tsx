import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, feedConfig, ticker } from "../../../test/utils.ts";
import { useMarketFeed } from "./useMarketFeed.ts";

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.install();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useMarketFeed", () => {
  it("goes connecting → live → stale at exactly the stale threshold", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    expect(result.current).toMatchObject({
      priceCents: null,
      fresh: false,
      connection: "connecting",
    });

    act(() => FakeWebSocket.latest.open());
    expect(result.current.connection).toBe("open");
    expect(JSON.parse(FakeWebSocket.latest.sent[0] ?? "{}")).toMatchObject({
      type: "subscribe",
      channels: ["ticker"],
      product_ids: ["BTC-USD"],
    });

    act(() => FakeWebSocket.latest.message(ticker("67500.00")));
    await advance(9_999);
    expect(result.current).toMatchObject({ priceCents: 6_750_000, fresh: true });

    await advance(1);
    expect(result.current.fresh).toBe(false);
    // The last known price stays available so the UI can show it as not live.
    expect(result.current.priceCents).toBe(6_750_000);
  });

  it("becomes fresh again when a valid event arrives after going stale", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.message(ticker("67500.00")));
    await advance(10_000);
    expect(result.current.fresh).toBe(false);

    act(() => FakeWebSocket.latest.message(ticker("67501.23")));
    await advance(20);
    expect(result.current).toMatchObject({ priceCents: 6_750_123, fresh: true });
  });

  it("ignores invalid messages: price unchanged and staleness not reset", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.message(ticker("67500.00")));
    await advance(5_000);

    const invalid = [
      ticker(undefined),
      ticker("not-a-price"),
      ticker("0"),
      ticker("-5"),
      ticker("68000.00", "ETH-USD"),
      { type: "heartbeat", product_id: "BTC-USD", price: "68000.00" },
      "{not json",
    ];
    for (const message of invalid) act(() => FakeWebSocket.latest.message(message));
    await advance(4_999);
    expect(result.current).toMatchObject({ priceCents: 6_750_000, fresh: true });

    await advance(1);
    expect(result.current.fresh).toBe(false);
    expect(result.current.priceCents).toBe(6_750_000);
  });

  it("indicates reconnecting and retries with exponential backoff capped at 30 s", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.drop());
    expect(result.current.connection).toBe("reconnecting");

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const before = FakeWebSocket.instances.length;
      await advance(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(before);
      await advance(1);
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
      act(() => FakeWebSocket.latest.drop()); // the attempt fails
    }
  });

  it("closes and reconnects an open connection that goes silent for the stale threshold", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.message(ticker("67500.00")));
    await advance(9_999);
    expect(result.current.connection).toBe("open");
    expect(FakeWebSocket.instances).toHaveLength(1);

    await advance(1);
    expect(result.current.connection).toBe("reconnecting");
    await advance(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("closes and reconnects an open connection that never delivers a valid price", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.message({ type: "subscriptions" }));
    await advance(10_000);
    expect(result.current.connection).toBe("reconnecting");
    await advance(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("keeps a connection that receives valid prices open", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    for (let second = 0; second < 30; second++) {
      act(() => FakeWebSocket.latest.message(ticker("67500.00")));
      await advance(1_000);
    }
    expect(result.current.connection).toBe("open");
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("resets the backoff once data flows again", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.drop());
    await advance(1_000);
    act(() => FakeWebSocket.latest.drop());
    await advance(2_000);
    act(() => FakeWebSocket.latest.open());
    act(() => FakeWebSocket.latest.message(ticker("67500.00")));
    expect(result.current.connection).toBe("open");

    act(() => FakeWebSocket.latest.drop());
    const before = FakeWebSocket.instances.length;
    await advance(1_000);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it("samples observations at most once per second", async () => {
    const { result } = renderHook(() => useMarketFeed(feedConfig));
    act(() => FakeWebSocket.latest.open());
    for (const [price, wait] of [
      ["67500.00", 400],
      ["67501.00", 500],
      ["67502.00", 100],
      ["67503.00", 1_000],
    ] as const) {
      act(() => FakeWebSocket.latest.message(ticker(price)));
      await advance(wait);
    }
    expect(result.current.observations.map((o) => o.cents)).toEqual([6_750_000, 6_750_300]);
  });

  it("renders at most once per animation frame for a burst of ticks", async () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useMarketFeed(feedConfig);
    });
    act(() => FakeWebSocket.latest.open());
    await advance(20);
    const before = renders;
    act(() => {
      for (let i = 0; i < 50; i++) FakeWebSocket.latest.message(ticker(`${67_500 + i}.00`));
    });
    await advance(20);
    // One for the first sample/freshness change, one for the batched price.
    expect(renders - before).toBeLessThanOrEqual(3);
  });
});
