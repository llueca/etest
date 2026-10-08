import type { PlayerView } from "../../../lib/api.ts";
import { formatPercent } from "../../../lib/format.ts";

/** Each statistic is one line of text, e.g. "Score: 0", so it reads the same everywhere. */
export function StatsSummary({ player }: { player: PlayerView }) {
  const rows: [string, string | number][] = [
    ["Score", player.score],
    ["Games played", player.gamesPlayed],
    ["Wins", player.wins],
    ["Losses", player.losses],
    ["Accuracy", player.accuracy === null ? "—" : formatPercent(player.accuracy)],
    ["Current streak", player.currentStreak],
    ["Best streak", player.bestStreak],
  ];
  return (
    <ul className="stats">
      {rows.map(([label, value]) => (
        <li key={label}>
          <span className="stat-label">{label}:</span> <span className="stat-value">{value}</span>
        </li>
      ))}
    </ul>
  );
}
