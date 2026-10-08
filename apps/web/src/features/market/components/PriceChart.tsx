import { memo, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useAnimationClock } from "../../../hooks/useAnimationClock.ts";
import { formatDuration, formatUsd } from "../../../lib/format.ts";
import type { Observation } from "../hooks/useMarketFeed.ts";
import {
  linePoints,
  nextPriceRange,
  type PriceRange,
  priceTicks,
  receivedPoints,
  timeTicks,
} from "../lib/chartModel.ts";

interface Props {
  observations: Observation[];
  /** The last valid price and when it was received; the line ends here while the feed is stale. */
  priceCents: number | null;
  priceAt: number | null;
  fresh: boolean;
  windowSeconds: number;
  /** Entry price in USD while a prediction is pending. */
  entryPrice?: number;
}

const timeLabel = (t: number) =>
  new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// Plot area geometry shared by the Recharts props and the time-label overlay.
const Y_AXIS_WIDTH = 64;
const MARGIN_RIGHT = 8;
const X_AXIS_HEIGHT = 30;
// Labels this close to either edge of the plot would hang outside the chart.
const LABEL_EDGE_PERCENT = 5;

/**
 * Time labels at round clock times. Recharts keys ticks by pixel position, so with a window
 * that moves every frame it would re-create every label every frame. Here each label keeps
 * one element, keyed by its time, and only its position changes.
 */
function TimeLabels({ start, end }: { start: number; end: number }) {
  return (
    <svg className="time-axis" aria-hidden="true">
      {timeTicks(start, end).map((t) => {
        const percent = ((t - start) / (end - start)) * 100;
        if (percent < LABEL_EDGE_PERCENT || percent > 100 - LABEL_EDGE_PERCENT) return null;
        return (
          <text key={t} x={`${percent}%`} y="16" textAnchor="middle" fill="#9fb0c3" fontSize={12}>
            {timeLabel(t)}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Rolling price chart (design D13). The time window moves every animation frame (once a second
 * under reduced motion), the line ends at the displayed price, and the price scale only changes
 * when it must. A fixed-height box keeps the layout still while it updates.
 */
export const PriceChart = memo(function PriceChart({
  observations,
  priceCents,
  priceAt,
  fresh,
  windowSeconds,
  entryPrice,
}: Props) {
  const now = useAnimationClock();
  const windowStart = now - windowSeconds * 1000;
  const latest = priceCents !== null && priceAt !== null ? { t: priceAt, cents: priceCents } : null;
  const received = receivedPoints(observations, latest, windowStart);
  const visible = received.filter((p) => p.t >= windowStart);
  const newest = visible.at(-1);
  const summary = `BTC/USD price over the last ${formatDuration(windowSeconds)}. ${
    newest ? `Latest price ${formatUsd(newest.price)}.` : "No data yet."
  }`;

  // The previous range is the hysteresis state; recomputing from it is idempotent.
  const rangeRef = useRef<PriceRange | null>(null);
  const data = linePoints(received, fresh, now);
  // "Collecting" is about the sampled observations (design D9), not the extra latest price.
  const sampled = observations.filter((o) => o.t >= windowStart).length;
  if (sampled >= 2) {
    const prices = visible.map((p) => p.price);
    if (entryPrice !== undefined) prices.push(entryPrice);
    rangeRef.current = nextPriceRange(prices, rangeRef.current);
  } else {
    rangeRef.current = null;
  }
  const range = rangeRef.current;

  return (
    <figure className="chart" aria-label={summary}>
      <div className="chart-box">
        {!range ? (
          <p className="chart-empty">Collecting recent price data…</p>
        ) : (
          <>
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 600, height: 240 }}
            >
              <LineChart
                data={data}
                margin={{ top: 8, right: MARGIN_RIGHT, bottom: 0, left: 0 }}
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="#2b3a4d" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="t"
                  scale="time"
                  domain={[windowStart, now]}
                  allowDataOverflow
                  height={X_AXIS_HEIGHT}
                  tick={false}
                  tickLine={false}
                  stroke="#9fb0c3"
                />
                <YAxis
                  type="number"
                  domain={[range.min, range.max]}
                  ticks={priceTicks(range)}
                  allowDataOverflow
                  tickFormatter={(v: number) =>
                    v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                  }
                  width={Y_AXIS_WIDTH}
                  stroke="#9fb0c3"
                  tick={{ fill: "#9fb0c3", fontSize: 12 }}
                />
                <Line
                  type="linear"
                  dataKey="price"
                  stroke="#7cc4ff"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {entryPrice !== undefined && (
                  <ReferenceLine
                    y={entryPrice}
                    stroke="#ffd166"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    label={{
                      value: formatUsd(entryPrice),
                      position: "insideTopRight",
                      fill: "#ffd166",
                      fontSize: 13,
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            <TimeLabels start={windowStart} end={now} />
          </>
        )}
      </div>
    </figure>
  );
});
