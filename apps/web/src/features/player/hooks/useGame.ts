import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createPlayer,
  type Direction,
  getMe,
  type MeResponse,
  NetworkError,
  type PlayerView,
  type PredictionView,
  placePrediction,
  type ResultView,
  renamePlayer,
} from "../../../lib/api.ts";

const STORAGE_KEY = "btc-game.playerId";

const readStoredId = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const storeId = (id: string | null) => {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Without storage the player simply is not remembered.
  }
};

interface Snapshot {
  token: string;
  player: PlayerView;
  activePrediction: PredictionView | null;
  lastResult: ResultView | null;
  /** serverTime - deviceTime in ms. */
  offsetMs: number;
}

export type GameLoad = "loading" | "error" | "ready";

export type RenameResult = { ok: true } | { ok: false; message: string };

export interface Game {
  load: GameLoad;
  /** Set once the player is loaded. */
  snapshot: Snapshot | null;
  /** A prediction request is in flight. */
  submitting: boolean;
  /** Set when a prediction could not be started; cleared by the next attempt. */
  predictionError: boolean;
  /**
   * A prediction request failed in a way that may have left a prediction on the server, and
   * the re-sync failed too. Prediction stays blocked until a read succeeds.
   */
  unconfirmed: boolean;
  start(): void;
  /** Re-reads the player; resolves to the fetched state, or undefined if that failed. */
  refresh(): Promise<MeResponse | undefined>;
  /** Re-reads the player after an unconfirmed prediction request and reports what it finds. */
  confirmPrediction(): Promise<void>;
  predict(direction: Direction): Promise<void>;
  rename(displayName: string): Promise<RenameResult>;
}

/**
 * Owns the player's server state: startup (restore, create or replace the stored
 * identifier), mutations and re-syncing. Everything here comes from the API; the
 * browser never decides a score or an outcome.
 */
export function useGame(): Game {
  const [load, setLoad] = useState<GameLoad>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [predictionError, setPredictionError] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const submittingRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  // Responses can arrive out of order. Reads are numbered when they start and a read is shown
  // only if it is newer than what is on screen. A mutation takes a number when its response
  // arrives, so it always beats the reads that were still in flight.
  const requestCount = useRef(0);
  const shownRequest = useRef(0);

  const applyMe = useCallback((token: string, me: MeResponse, offsetMs: number) => {
    tokenRef.current = token;
    setUnconfirmed(false); // any successful read settles what the server holds
    setSnapshot({
      token,
      player: me.player,
      activePrediction: me.activePrediction,
      lastResult: me.lastResult,
      offsetMs,
    });
  }, []);

  const start = useCallback(() => {
    setLoad("loading");
    (async () => {
      try {
        const stored = readStoredId();
        if (stored) {
          try {
            const { data, offsetMs } = await getMe(stored);
            shownRequest.current = ++requestCount.current;
            applyMe(stored, data, offsetMs);
            setLoad("ready");
            return;
          } catch (error) {
            // Only a definite "unknown player" replaces the identifier; any other
            // failure keeps it so a retry restores the same player.
            if (!(error instanceof ApiError && error.status === 401)) throw error;
            storeId(null);
          }
        }
        const { data, offsetMs } = await createPlayer();
        storeId(data.playerId);
        shownRequest.current = ++requestCount.current;
        applyMe(
          data.playerId,
          { player: data.player, activePrediction: null, lastResult: null },
          offsetMs,
        );
        setLoad("ready");
      } catch {
        setLoad("error");
      }
    })();
  }, [applyMe]);

  useEffect(start, [start]);

  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return undefined;
    const request = ++requestCount.current;
    try {
      const { data, offsetMs } = await getMe(token);
      if (request > shownRequest.current) {
        shownRequest.current = request;
        applyMe(token, data, offsetMs);
      }
      // A skipped read is still a valid answer for the caller: it started after its own trigger.
      return data;
    } catch {
      // Keep showing the last known state; the next trigger tries again.
      return undefined;
    }
  }, [applyMe]);

  // Another tab may have changed the player, and timers are unreliable while hidden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const predict = useCallback(
    async (direction: Direction) => {
      const token = tokenRef.current;
      if (!token || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setPredictionError(false);
      try {
        const { data, offsetMs } = await placePrediction(token, direction);
        shownRequest.current = ++requestCount.current;
        setSnapshot((previous) =>
          previous
            ? { ...previous, activePrediction: data.prediction, lastResult: null, offsetMs }
            : previous,
        );
      } catch (error) {
        // Conflict, provider failure or an unknown outcome: ask the server what is true.
        const latest = await refresh();
        const conflict = error instanceof ApiError && error.status === 409;
        const unknownOutcome = error instanceof NetworkError;
        if (!latest && (conflict || unknownOutcome)) {
          // A prediction may exist that this page cannot see: do not offer another one yet.
          setUnconfirmed(true);
        } else if (!conflict && !latest?.activePrediction) {
          // A retry message only makes sense if no prediction exists after all.
          setPredictionError(true);
        }
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [refresh],
  );

  const confirmPrediction = useCallback(async () => {
    const latest = await refresh();
    if (latest && !latest.activePrediction) setPredictionError(true);
  }, [refresh]);

  const rename = useCallback(async (displayName: string): Promise<RenameResult> => {
    const token = tokenRef.current;
    if (!token) return { ok: false, message: "Your player is not loaded yet." };
    try {
      const { data } = await renamePlayer(token, displayName);
      shownRequest.current = ++requestCount.current;
      setSnapshot((previous) => (previous ? { ...previous, player: data.player } : previous));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ApiError && error.status === 400
            ? error.message
            : "Could not save the name. Try again.",
      };
    }
  }, []);

  return {
    load,
    snapshot,
    submitting,
    predictionError,
    unconfirmed,
    start,
    refresh,
    confirmPrediction,
    predict,
    rename,
  };
}
