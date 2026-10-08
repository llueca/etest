import { describe, expect, it } from "vitest";
import { linePoints, nextPriceRange, priceTicks, receivedPoints, timeTicks } from "./chartModel.ts";

const obs = (t: number, cents: number) => ({ t, cents });

describe("nextPriceRange", () => {
  it("uses round steps (1, 2 or 5 × 10^n, at least 1) with at most four intervals", () => {
    for (const [low, high] of [
      [67_500, 67_500.6],
      [67_480, 67_530],
      [60_000, 70_500],
      [0.2, 0.9],
      [67_123.45, 67_890.12],
    ] as const) {
      const range = nextPriceRange([low, high], null);
      expect(range.step).toBeGreaterThanOrEqual(1);
      expect([1, 2, 5]).toContain(range.step / 10 ** Math.floor(Math.log10(range.step)));
      expect(Math.abs(range.min % range.step)).toBe(0);
      expect(Math.abs(range.max % range.step)).toBe(0);
      expect((range.max - range.min) / range.step).toBeLessThanOrEqual(4);
      expect(range.min).toBeLessThanOrEqual(low);
      expect(range.max).toBeGreaterThanOrEqual(high);
    }
  });

  it("draws a flat line inside a range of at least two steps, not on an edge", () => {
    const range = nextPriceRange([67_500, 67_500], null);
    expect(range).toEqual({ min: 67_499, max: 67_501, step: 1 });
  });

  it("keeps the range, and so the labels, for a price inside it", () => {
    const first = nextPriceRange([67_500, 67_500], null);
    expect(nextPriceRange([67_500, 67_500.6], first)).toBe(first);
  });

  it("expands as soon as a price would fall outside the range", () => {
    const first = nextPriceRange([67_500, 67_500], null);
    const expanded = nextPriceRange([67_500, 69_000], first);
    expect(expanded.min).toBeLessThanOrEqual(67_500);
    expect(expanded.max).toBeGreaterThanOrEqual(69_000);
    expect(expanded.step).toBeGreaterThan(first.step);
  });

  it("contracts only when the values fill less than half of the range", () => {
    const spike = nextPriceRange([67_500, 69_000], null);
    const span = spike.max - spike.min;

    // Values still fill at least half of the range: keep it.
    expect(nextPriceRange([67_500, 67_500 + span / 2], spike)).toBe(spike);

    // The spike left the window: the remaining prices fill little of the range.
    const contracted = nextPriceRange([67_500, 67_520], spike);
    expect(contracted.max - contracted.min).toBeLessThan(span);
    expect(contracted.min).toBeLessThanOrEqual(67_500);
    expect(contracted.max).toBeGreaterThanOrEqual(67_520);
  });

  it("lists the labels from min to max in steps", () => {
    expect(priceTicks({ min: 67_000, max: 70_000, step: 1_000 })).toEqual([
      67_000, 68_000, 69_000, 70_000,
    ]);
  });
});

describe("timeTicks", () => {
  it("is at round clock times, one per minute for a five-minute window", () => {
    const end = Date.UTC(2026, 0, 1, 12, 0, 20);
    const ticks = timeTicks(end - 300_000, end);
    expect(ticks).toHaveLength(5);
    for (const tick of ticks) expect(tick % 60_000).toBe(0);
  });

  it("keeps a tick at the same time as the window moves", () => {
    const end = Date.UTC(2026, 0, 1, 12, 0, 20);
    const before = timeTicks(end - 300_000, end);
    const after = timeTicks(end - 299_000, end + 1_000);
    expect(after).toEqual(expect.arrayContaining(before.slice(1)));
  });

  it("scales with the configured window", () => {
    const end = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(timeTicks(end - 90_000, end).every((t) => t % 30_000 === 0)).toBe(true);
  });
});

describe("line points", () => {
  const NOW = 1_000_000;
  const windowStart = NOW - 300_000;

  it("includes the latest received price even when it was not sampled", () => {
    const points = receivedPoints([obs(NOW - 5_000, 100)], obs(NOW - 4_500, 150), windowStart);
    expect(points.at(-1)).toEqual({ t: NOW - 4_500, price: 1.5 });
  });

  it("uses the latest price when it arrives in the same millisecond as the last sample", () => {
    const points = receivedPoints([obs(NOW - 5_000, 100)], obs(NOW - 5_000, 150), windowStart);
    expect(points).toEqual([{ t: NOW - 5_000, price: 1.5 }]);
  });

  it("does not repeat a latest price that is already the last sample", () => {
    const sample = obs(NOW - 5_000, 100);
    expect(receivedPoints([sample], sample, windowStart)).toHaveLength(1);
  });

  it("keeps one point older than the window so the line leaves through the left edge", () => {
    const points = receivedPoints(
      [obs(windowStart - 5_000, 100), obs(windowStart - 1_000, 110), obs(windowStart + 1_000, 120)],
      null,
      windowStart,
    );
    expect(points.map((p) => p.price)).toEqual([1.1, 1.2]);
  });

  it("ends the line at now with the latest price while the feed is fresh", () => {
    const received = receivedPoints([obs(NOW - 5_000, 100)], obs(NOW - 500, 150), windowStart);
    expect(linePoints(received, true, NOW).at(-1)).toEqual({ t: NOW, price: 1.5 });
  });

  it("does not extend the line past the last price received while the feed is stale", () => {
    const received = receivedPoints([obs(NOW - 30_000, 100)], obs(NOW - 20_000, 150), windowStart);
    const line = linePoints(received, false, NOW);
    expect(line).toEqual(received);
    expect(line.at(-1)).toEqual({ t: NOW - 20_000, price: 1.5 });
  });
});
