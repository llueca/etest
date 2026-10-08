// Pure business rules shared by the browser (live status) and the server
// (settlement). No I/O and no clock access: time is always passed in.
// Public surface = design D6. Prices are integer cents; times are epoch ms.

export type Direction = "up" | "down";
export type SettlementOutcome = "won" | "lost" | "pending";
export type LiveStatus = "winning" | "losing" | "tied";

/** Default, and minimum, prediction window. The configured window applies at creation. */
export const PREDICTION_WINDOW_MS = 60_000;

export interface PredictionTerms {
  direction: Direction;
  entryPriceCents: number;
  /** Epoch ms from which the prediction may settle. */
  eligibleAt: number;
}

export interface PlayerStats {
  score: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
}

export interface DerivedStats {
  gamesPlayed: number;
  /** wins / gamesPlayed as a 0-1 fraction, or null when no games were played. */
  accuracy: number | null;
  /** (wins + 5) / (gamesPlayed + 10) as a 0-1 fraction. */
  adjustedAccuracy: number;
}

/** What the leaderboard comparators need to know about a player. */
export interface RankInput {
  score: number;
  wins: number;
  losses: number;
  /** Epoch ms. */
  createdAt: number;
}

export type NameValidation = { ok: true; value: string } | { ok: false; reason: string };

/** Positive when `live` favours the player, negative when it goes against them, 0 on a tie. */
function favour(direction: Direction, entryCents: number, priceCents: number): number {
  const move = Math.sign(priceCents - entryCents);
  return direction === "up" ? move : -move;
}

/** "pending" before eligibleAt or on an exact price tie; otherwise won/lost. */
export function evaluateSettlement(
  prediction: PredictionTerms,
  priceCents: number,
  now: number,
): SettlementOutcome {
  if (now < prediction.eligibleAt) return "pending";
  const result = favour(prediction.direction, prediction.entryPriceCents, priceCents);
  if (result === 0) return "pending";
  return result > 0 ? "won" : "lost";
}

export function applyOutcome(stats: PlayerStats, outcome: "won" | "lost"): PlayerStats {
  if (outcome === "lost") {
    return { ...stats, score: stats.score - 1, losses: stats.losses + 1, currentStreak: 0 };
  }
  const currentStreak = stats.currentStreak + 1;
  return {
    ...stats,
    score: stats.score + 1,
    wins: stats.wins + 1,
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
  };
}

/** Adjusted accuracy is (wins + 5) / (games + 10): a neutral prior worth 5 wins and 5 losses. */
const PRIOR_WINS = 5;
const PRIOR_GAMES = 10;

export function deriveStats(stats: Pick<PlayerStats, "wins" | "losses">): DerivedStats {
  const gamesPlayed = stats.wins + stats.losses;
  return {
    gamesPlayed,
    accuracy: gamesPlayed === 0 ? null : stats.wins / gamesPlayed,
    adjustedAccuracy: (stats.wins + PRIOR_WINS) / (gamesPlayed + PRIOR_GAMES),
  };
}

export function liveStatus(
  direction: Direction,
  entryCents: number,
  liveCents: number,
): LiveStatus {
  const result = favour(direction, entryCents, liveCents);
  if (result === 0) return "tied";
  return result > 0 ? "winning" : "losing";
}

const gamesPlayed = (p: RankInput) => p.wins + p.losses;

/** Descending by adjusted accuracy, compared as exact fractions (never rounded). */
function compareAdjustedAccuracy(a: RankInput, b: RankInput): number {
  const left = (a.wins + PRIOR_WINS) * (gamesPlayed(b) + PRIOR_GAMES);
  const right = (b.wins + PRIOR_WINS) * (gamesPlayed(a) + PRIOR_GAMES);
  return right - left;
}

/** Array.sort comparator: adjusted accuracy desc, games desc, createdAt asc. */
export function comparePredictorRank(a: RankInput, b: RankInput): number {
  return (
    compareAdjustedAccuracy(a, b) || gamesPlayed(b) - gamesPlayed(a) || a.createdAt - b.createdAt
  );
}

/** Array.sort comparator: score desc, then the predictor ordering. */
export function compareScoreRank(a: RankInput, b: RankInput): number {
  return b.score - a.score || comparePredictorRank(a, b);
}

// Control characters, plus the Unicode line and paragraph separators.
const CONTROL_CHARACTERS = /[\p{Cc}\u2028\u2029]/u;

export function validateDisplayName(input: string, maxLength: number): NameValidation {
  const value = input.trim();
  if (value === "") return { ok: false, reason: "Name must not be empty." };
  if (CONTROL_CHARACTERS.test(value)) {
    return { ok: false, reason: "Name must not contain control characters." };
  }
  if ([...value].length > maxLength) {
    return { ok: false, reason: `Name must be at most ${maxLength} characters long (maximum).` };
  }
  return { ok: true, value };
}

/** Exact decimal parsing to integer cents; null for invalid or non-positive prices. */
export function parsePriceToCents(text: string): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  const roundsUp = fraction.length > 2 && Number(fraction[2]) >= 5;
  const cents =
    Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0")) + (roundsUp ? 1 : 0);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
