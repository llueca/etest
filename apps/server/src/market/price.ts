import type { AppConfig } from "@btc/shared/config";
import { parsePriceToCents } from "@btc/shared/domain";

export class MarketUnavailableError extends Error {}

/**
 * One authoritative BTC/USD price in cents from the provider's REST ticker.
 * Any failure (network, timeout, bad status, unusable payload) throws
 * MarketUnavailableError: callers never guess a price.
 */
export async function fetchPriceCents(
  config: Pick<AppConfig, "marketRestUrl" | "marketProductId" | "marketTimeoutMs">,
): Promise<number> {
  const url = `${config.marketRestUrl.replace(/\/$/, "")}/products/${config.marketProductId}/ticker`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(config.marketTimeoutMs) });
    if (!response.ok) throw new Error(`provider answered ${response.status}`);
    const { price } = (await response.json()) as { price?: unknown };
    const cents = typeof price === "string" ? parsePriceToCents(price) : null;
    if (cents === null) throw new Error("provider returned no usable price");
    return cents;
  } catch (error) {
    throw new MarketUnavailableError(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}
