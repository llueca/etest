import type { PlayerView, PredictorEntry, ScoreEntry } from "../../../lib/api.ts";
import { formatPercent, formatPercentOneDecimal } from "../../../lib/format.ts";
import type { Leaderboards as LeaderboardsState } from "../hooks/useLeaderboards.ts";

const YOU = <strong className="you">You</strong>;

function Board({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <section className="board" aria-label={title}>
      <h3>{title}</h3>
      {empty ? <p className="board-empty">No one is ranked yet.</p> : children}
    </section>
  );
}

function ScoreRow({ entry }: { entry: ScoreEntry }) {
  return (
    <li className={entry.isCurrentPlayer ? "row row--me" : "row"}>
      <span className="row-position">{entry.position}</span>
      <span className="row-name">
        {entry.displayName} {entry.isCurrentPlayer && YOU}
      </span>
      <span className="row-value">{entry.score}</span>
    </li>
  );
}

function PredictorRow({ entry }: { entry: PredictorEntry }) {
  return (
    <li className={entry.isCurrentPlayer ? "row row--me row--predictor" : "row row--predictor"}>
      <span className="row-position">{entry.position}</span>
      <span className="row-name">
        {entry.displayName} {entry.isCurrentPlayer && YOU}
      </span>
      <span className="row-value" title="Adjusted accuracy">
        {formatPercentOneDecimal(entry.adjustedAccuracy)}
      </span>
      <span className="row-detail">
        <span>{entry.accuracy === null ? "—" : formatPercent(entry.accuracy)}</span> raw ·{" "}
        <span>{entry.gamesPlayed}</span> games
      </span>
    </li>
  );
}

interface Props {
  leaderboards: LeaderboardsState;
  player: PlayerView;
}

/** Both boards share one loading, error and not-yet-eligible message: one request feeds both. */
export function Leaderboards({ leaderboards, player }: Props) {
  const { data, status, retry } = leaderboards;

  if (!data && status === "error") {
    return (
      <div className="board-error">
        <p className="error">Could not load the leaderboards.</p>
        <button type="button" className="btn btn-quiet" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) return <p className="board-loading">Loading leaderboards…</p>;

  const eligible = player.gamesPlayed > 0;
  const scoreEntries = data.score.entries;
  const predictorEntries = data.predictor.entries;
  const ownScoreListed = scoreEntries.some((e) => e.isCurrentPlayer);
  const ownPredictorListed = predictorEntries.some((e) => e.isCurrentPlayer);

  return (
    <>
      {status === "error" && (
        <div className="board-error">
          <p className="error">Could not load the leaderboards.</p>
          <button type="button" className="btn btn-quiet" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {!eligible && (
        <p className="board-note">Complete a prediction to get onto the leaderboards.</p>
      )}
      <div className="boards">
        <Board title="Score leaderboard" empty={scoreEntries.length === 0}>
          <ol className="rows">
            {scoreEntries.map((entry) => (
              <ScoreRow key={entry.position} entry={entry} />
            ))}
          </ol>
          {eligible && !ownScoreListed && <p className="own">Your score: {player.score}</p>}
        </Board>
        <Board title="Predictor leaderboard" empty={predictorEntries.length === 0}>
          <ol className="rows">
            {predictorEntries.map((entry) => (
              <PredictorRow key={entry.position} entry={entry} />
            ))}
          </ol>
          {eligible && !ownPredictorListed && (
            <p className="own">
              Your adjusted accuracy: {formatPercentOneDecimal(player.adjustedAccuracy)} · raw{" "}
              {player.accuracy === null ? "—" : formatPercent(player.accuracy)} ·{" "}
              {player.gamesPlayed} games
            </p>
          )}
        </Board>
      </div>
    </>
  );
}
