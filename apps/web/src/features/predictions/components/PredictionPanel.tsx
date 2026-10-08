import { liveStatus } from "@btc/shared/domain";
import { useEffect } from "react";
import type { PredictionView, ResultView } from "../../../lib/api.ts";
import { formatDuration, formatUsd, toCents } from "../../../lib/format.ts";
import { ResultCard } from "../../progress/components/ResultCard.tsx";
import { useCountdown } from "../hooks/useCountdown.ts";

interface Props {
  active: PredictionView | null;
  result: ResultView | null;
  offsetMs: number;
  /** Latest live price in cents while the feed is fresh; null otherwise. */
  livePriceCents: number | null;
  predictionError: boolean;
  /** A prediction request may have succeeded and the server state could not be re-read. */
  unconfirmed: boolean;
  /** Spoken only: feed lost / restored. */
  feedAnnouncement: string;
  resolvePollIntervalMs: number;
  /** Configured window, stated in the invitation. */
  predictionWindowSeconds: number;
  onResolvePoll(): void;
  /** Re-reads the player to find out whether the unconfirmed prediction exists. */
  onConfirm(): void;
}

/**
 * The one polite live region: it holds exactly the events that are announced
 * (prediction placed, Resolving…, result, errors, feed lost/restored). Price ticks,
 * countdown seconds and WINNING/LOSING are rendered outside it, so they stay silent.
 */
export function PredictionPanel(props: Props) {
  const { active, result, offsetMs, livePriceCents, resolvePollIntervalMs, onResolvePoll } = props;
  const { secondsLeft, resolving } = useCountdown(active?.eligibleAt, offsetMs);

  // While Resolving…, check the server for the settled result without any player action.
  useEffect(() => {
    if (!active || !resolving) return;
    const timer = setInterval(onResolvePoll, resolvePollIntervalMs);
    return () => clearInterval(timer);
  }, [active, resolving, resolvePollIntervalMs, onResolvePoll]);

  const status =
    active && livePriceCents !== null
      ? liveStatus(active.direction, toCents(active.entryPrice), livePriceCents)
      : null;

  return (
    <div className="play-body">
      <div className="status-panel" aria-live="polite">
        {props.predictionError && (
          <p className="error">Could not start your prediction. Try again.</p>
        )}
        {props.unconfirmed && (
          <>
            <p className="error">
              We could not confirm whether your prediction started. Check again before predicting.
            </p>
            <button type="button" className="btn btn-quiet" onClick={props.onConfirm}>
              Check again
            </button>
          </>
        )}
        {active ? (
          <div className="active">
            <p className="active-direction">
              Your prediction: <strong>{active.direction.toUpperCase()}</strong>
            </p>
            <p className="active-entry">Entry price: {formatUsd(active.entryPrice)}</p>
            {resolving && <p className="resolving">Resolving…</p>}
          </div>
        ) : result ? (
          <ResultCard result={result} />
        ) : (
          <p className="invitation">
            Make your first prediction: will Bitcoin be higher or lower after{" "}
            {formatDuration(props.predictionWindowSeconds)}?
          </p>
        )}
        <span className="sr-only">{props.feedAnnouncement}</span>
      </div>
      {active && (
        <div className="progress">
          {!resolving && secondsLeft !== null && (
            <p className="time-left">
              Time left: {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
            </p>
          )}
          {status ? (
            <p className="live-status">
              Live status:{" "}
              <strong className={`status status--${status}`}>{status.toUpperCase()}</strong>
            </p>
          ) : (
            <p className="live-status">Live status unavailable</p>
          )}
        </div>
      )}
    </div>
  );
}
