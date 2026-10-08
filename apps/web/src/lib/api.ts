// Typed client for the HTTP API (design D7). Every response carries the server's
// clock, from which a device clock offset is derived.

import { fetchJson, type JsonResponse } from "./http.ts";

export type Direction = "up" | "down";

export interface PlayerView {
  displayName: string;
  score: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  accuracy: number | null;
  adjustedAccuracy: number;
  currentStreak: number;
  bestStreak: number;
}

export interface PredictionView {
  id: string;
  direction: Direction;
  /** USD */
  entryPrice: number;
  createdAt: number;
  eligibleAt: number;
  status: "pending";
}

export interface ResultView {
  id: string;
  direction: Direction;
  entryPrice: number;
  createdAt: number;
  eligibleAt: number;
  status: "won" | "lost";
  settlementPrice: number;
  settledAt: number;
  scoreDelta: number;
  scoreBefore: number;
  scoreAfter: number;
}

export interface MeResponse {
  player: PlayerView;
  activePrediction: PredictionView | null;
  lastResult: ResultView | null;
}

export interface LeaderboardsResponse {
  score: { entries: ScoreEntry[] };
  predictor: { entries: PredictorEntry[] };
}

export interface ScoreEntry {
  position: number;
  displayName: string;
  score: number;
  isCurrentPlayer: boolean;
}

export interface PredictorEntry {
  position: number;
  displayName: string;
  adjustedAccuracy: number;
  accuracy: number | null;
  gamesPlayed: number;
  isCurrentPlayer: boolean;
}

/** The server answered with an error status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** No usable answer (offline, timeout, unreadable body): the outcome is unknown. */
export class NetworkError extends Error {}

export interface ApiResult<T> {
  data: T;
  /** serverTime - deviceTime, in ms; add it to Date.now() to get server time. */
  offsetMs: number;
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const sentAt = Date.now();
  let result: JsonResponse;
  try {
    result = await fetchJson(path, {
      method: options.method ?? "GET",
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    // Offline, a dropped connection, or no response within REQUEST_TIMEOUT_MS: the outcome is unknown.
    throw new NetworkError(error instanceof Error ? error.message : "Network error");
  }
  const { response, receivedAt } = result;
  const payload = result.payload as
    | { error?: { code?: string; message?: string }; serverTime?: string }
    | undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? "unknown",
      payload?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  if (!payload) throw new NetworkError("Unreadable response");
  const serverTime = Date.parse(payload.serverTime ?? "");
  // Compare against the midpoint of the round trip to cancel out latency.
  const offsetMs = Number.isFinite(serverTime) ? serverTime - (sentAt + receivedAt) / 2 : 0;
  return { data: payload as T, offsetMs };
}

export const createPlayer = () =>
  request<{ playerId: string; player: PlayerView }>("/api/players", { method: "POST" });

export const getMe = (token: string) => request<MeResponse>("/api/me", { token });

export const renamePlayer = (token: string, displayName: string) =>
  request<{ player: PlayerView }>("/api/me", { method: "PATCH", token, body: { displayName } });

export const placePrediction = (token: string, direction: Direction) =>
  request<{ prediction: PredictionView }>("/api/me/predictions", {
    method: "POST",
    token,
    body: { direction },
  });

export const getLeaderboards = (token?: string) =>
  request<LeaderboardsResponse>("/api/leaderboards", { token });
