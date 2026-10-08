import type { ResultView } from "../../../lib/api.ts";
import { formatUsd } from "../../../lib/format.ts";

/** The last settled prediction. Outcome and score change are text, never only colour. */
export function ResultCard({ result }: { result: ResultView }) {
  const won = result.status === "won";
  const delta = result.scoreDelta > 0 ? `+${result.scoreDelta}` : `${result.scoreDelta}`;
  return (
    <article className={won ? "result result--win" : "result result--loss"}>
      <p className="result-head">
        <strong className="result-outcome">{won ? "WIN" : "LOSS"}</strong>
        <span className="result-direction">{result.direction.toUpperCase()}</span>
      </p>
      <p className="result-prices">
        {formatUsd(result.entryPrice)} → {formatUsd(result.settlementPrice)}
      </p>
      <p className="result-delta">
        <strong>{delta}</strong>
      </p>
      <p className="result-score">
        Score: {result.scoreBefore} → {result.scoreAfter}
      </p>
    </article>
  );
}
