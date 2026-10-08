import { formatCents } from "../../../lib/format.ts";
import type { MarketFeed } from "../hooks/useMarketFeed.ts";

export const FEED_STATUS_ID = "feed-status";

/** One sentence describing the feed. It is also the reason predictions are disabled while it is not fresh. */
function feedStatusText({ priceCents, fresh, connection }: MarketFeed): string {
  if (priceCents === null) {
    return connection === "reconnecting"
      ? "Reconnecting to live market data…"
      : "Connecting to live market data…";
  }
  if (!fresh) {
    return connection === "open" ? "Live data is stale." : "Live data is stale. Reconnecting…";
  }
  return connection === "open" ? "Live" : "Reconnecting to live market data…";
}

export function PriceDisplay({ feed }: { feed: MarketFeed }) {
  const { priceCents, fresh } = feed;
  return (
    <div className="price-block">
      {priceCents === null ? (
        <p className="price price--empty" aria-hidden="true">
          —
        </p>
      ) : (
        <p className={fresh ? "price" : "price price--stale"}>{formatCents(priceCents)}</p>
      )}
      <p id={FEED_STATUS_ID} className="feed-status" data-fresh={fresh}>
        <span className="feed-dot" aria-hidden="true" />
        {feedStatusText(feed)}
      </p>
    </div>
  );
}
