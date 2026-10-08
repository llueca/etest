const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$67,500.00" from a USD amount. */
export const formatUsd = (usd: number) => usdFormat.format(usd);

export const formatCents = (cents: number) => formatUsd(cents / 100);

/** Whole-number percent, e.g. 0.6667 -> "67%". */
export const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Percent with one decimal, e.g. 8/13 -> "61.5%". */
export const formatPercentOneDecimal = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

/** API prices are USD numbers; the domain compares integer cents. */
export const toCents = (usd: number) => Math.round(usd * 100);

/** "1 minute", "5 minutes", "90 seconds". */
export function formatDuration(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
