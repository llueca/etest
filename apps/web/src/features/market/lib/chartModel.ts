import type { Observation } from "../hooks/useMarketFeed.ts";

/** Pure rules for what the price chart draws (design D13). */

export interface ChartPoint {
  t: number;
  price: number;
}

/**
 * Received prices for the window: the samples plus the latest received price (which may be
 * newer than the last once-a-second sample). One point older than the window is kept so the
 * line leaves through the left edge instead of its start popping forward.
 */
export function receivedPoints(
  observations: Observation[],
  latest: Observation | null,
  windowStart: number,
): ChartPoint[] {
  const points = observations.map((o) => ({ t: o.t, price: o.cents / 100 }));
  const last = points.at(-1);
  if (latest) {
    const point = { t: latest.t, price: latest.cents / 100 };
    // The latest price wins over a sample taken in the same millisecond.
    if (last && last.t === latest.t) points[points.length - 1] = point;
    else if (!last || latest.t > last.t) points.push(point);
  }
  const firstInside = points.findIndex((p) => p.t >= windowStart);
  if (firstInside === -1) return [];
  return points.slice(Math.max(firstInside - 1, 0));
}

/**
 * The line to draw. While the feed is fresh it ends at `now` with the latest price, so it ends
 * at the displayed price and glides with the clock. While stale it ends at the last price
 * received: the chart never shows a price that was not received.
 */
export function linePoints(received: ChartPoint[], fresh: boolean, now: number): ChartPoint[] {
  const tail = received.at(-1);
  return fresh && tail ? [...received, { t: now, price: tail.price }] : received;
}

export interface PriceRange {
  min: number;
  max: number;
  /** Distance between axis labels: 1, 2 or 5 × a power of ten, at least 1. */
  step: number;
}

const MAX_INTERVALS = 4;
const PADDING = 0.1;

function fit(low: number, high: number): PriceRange {
  const padding = (high - low) * PADDING;
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const factor of [1, 2, 5]) {
      const step = factor * magnitude;
      let min = Math.floor((low - padding) / step) * step;
      let max = Math.ceil((high + padding) / step) * step;
      if ((max - min) / step > MAX_INTERVALS) continue;
      // At least two intervals, so a flat line sits inside the chart, not on its edge.
      for (let grow = 0; max - min < 2 * step; grow++) {
        if (grow % 2 === 0) min -= step;
        else max += step;
      }
      return { min, max, step };
    }
  }
}

/**
 * The price axis range for the visible prices (and the entry price). It keeps `previous`
 * unless a value would fall outside it (expand) or the values fill less than half of it and
 * a tighter range exists (contract), so the labels do not change on every new price.
 */
export function nextPriceRange(values: number[], previous: PriceRange | null): PriceRange {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const fitted = fit(low, high);
  if (!previous) return fitted;
  if (low < previous.min || high > previous.max) return fitted;
  const fillsHalf = (high - low) * 2 >= previous.max - previous.min;
  const tighter = fitted.max - fitted.min < previous.max - previous.min;
  return fillsHalf || !tighter ? previous : fitted;
}

export function priceTicks({ min, max, step }: PriceRange): number[] {
  const ticks: number[] = [];
  for (let price = min; price <= max; price += step) ticks.push(price);
  return ticks;
}

const TIME_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
const MAX_TIME_LABELS = 5;

/** Time-axis ticks at round clock times, so a label keeps its text while it moves left. */
export function timeTicks(startMs: number, endMs: number): number[] {
  const windowSeconds = (endMs - startMs) / 1000;
  const stepSeconds =
    TIME_STEPS_SECONDS.find((s) => windowSeconds / s <= MAX_TIME_LABELS) ??
    TIME_STEPS_SECONDS[TIME_STEPS_SECONDS.length - 1] ??
    1;
  const stepMs = stepSeconds * 1000;
  const ticks: number[] = [];
  for (let t = Math.ceil(startMs / stepMs) * stepMs; t <= endMs; t += stepMs) ticks.push(t);
  return ticks;
}
