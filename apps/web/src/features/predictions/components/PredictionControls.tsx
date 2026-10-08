import type { Direction } from "../../../lib/api.ts";
import { FEED_STATUS_ID } from "../../market/components/PriceDisplay.tsx";

const REASON_ID = "controls-reason";

interface Props {
  hasActivePrediction: boolean;
  submitting: boolean;
  /** The server state is unknown after a failed request, so a prediction may already exist. */
  unconfirmed: boolean;
  feedFresh: boolean;
  onPredict(direction: Direction): void;
}

/** UP/DOWN are native buttons; every disabled state has a reason available as text. */
export function PredictionControls({
  hasActivePrediction,
  submitting,
  unconfirmed,
  feedFresh,
  onPredict,
}: Props) {
  const reason = hasActivePrediction
    ? "active"
    : submitting
      ? "submitting"
      : unconfirmed
        ? "unconfirmed"
        : feedFresh
          ? null
          : "feed";
  const describedBy = reason === "feed" ? FEED_STATUS_ID : reason ? REASON_ID : undefined;
  const disabled = reason !== null;

  return (
    <div className="controls-block">
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset's default min-inline-size and border would break the two-column grid */}
      <div className="controls" role="group" aria-label="Place a prediction">
        <button
          type="button"
          className="btn btn-up"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-label="Predict higher (UP)"
          onClick={() => onPredict("up")}
        >
          <span aria-hidden="true">▲</span> Higher
        </button>
        <button
          type="button"
          className="btn btn-down"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-label="Predict lower (DOWN)"
          onClick={() => onPredict("down")}
        >
          <span aria-hidden="true">▼</span> Lower
        </button>
      </div>
      <p id={REASON_ID} className="hint">
        {reason === "active" && "A prediction is in progress."}
        {reason === "submitting" && "Starting your prediction…"}
        {reason === "unconfirmed" && "Confirm your prediction status first."}
      </p>
    </div>
  );
}
