import type { RankInput } from "@btc/shared/domain";

// Fixed-width strings whose lexicographic order equals the leaderboard ordering
// defined by compareScoreRank / comparePredictorRank (design D4). DynamoDB
// sorts string range keys bytewise, so a descending GSI query is the ranking.

const SCORE_OFFSET = 10n ** 12n;
const MAX_TIMESTAMP = 9_999_999_999_999n;
const ACCURACY_SCALE = 10n ** 15n;

const pad = (value: bigint, width: number) => value.toString().padStart(width, "0");

/** floor((wins + 5) * 10^15 / (games + 10)): equal fractions give equal values. */
function scaledAdjustedAccuracy({ wins, losses }: RankInput): bigint {
  return (BigInt(wins + 5) * ACCURACY_SCALE) / BigInt(wins + losses + 10);
}

function tailKey(player: RankInput): string {
  const games = BigInt(player.wins + player.losses);
  return (
    pad(scaledAdjustedAccuracy(player), 16) +
    pad(games, 10) +
    pad(MAX_TIMESTAMP - BigInt(player.createdAt), 13)
  );
}

export function accuracyRankKey(player: RankInput): string {
  return tailKey(player);
}

export function scoreRankKey(player: RankInput): string {
  return pad(BigInt(player.score) + SCORE_OFFSET, 13) + tailKey(player);
}
