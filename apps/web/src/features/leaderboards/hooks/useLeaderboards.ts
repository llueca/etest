import { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboards, type LeaderboardsResponse } from "../../../lib/api.ts";

export interface Leaderboards {
  data: LeaderboardsResponse | null;
  status: "loading" | "ready" | "error";
  retry(): void;
}

/**
 * After the player's own settlement or rename, the leaderboard indexes are updated a moment
 * after the write (DynamoDB GSIs are eventually consistent), so the reload waits this long.
 */
export const INDEX_SETTLE_MS = 1_500;

/**
 * Loads both leaderboards. They are not streamed: they reload when `reloadKey`
 * changes (the player's settlement or rename, after INDEX_SETTLE_MS) and on retry.
 * Previous data stays visible while reloading.
 */
export function useLeaderboards(token: string | undefined, reloadKey: string): Leaderboards {
  const [data, setData] = useState<LeaderboardsResponse | null>(null);
  const [status, setStatus] = useState<Leaderboards["status"]>("loading");
  const latest = useRef(0);
  const loadedFor = useRef<{ token: string | undefined } | null>(null);

  const load = useCallback(() => {
    const request = ++latest.current;
    setStatus((current) => (current === "ready" ? current : "loading"));
    getLeaderboards(token)
      .then(({ data }) => {
        if (request !== latest.current) return;
        setData(data);
        setStatus("ready");
      })
      .catch(() => {
        if (request === latest.current) setStatus("error");
      });
  }, [token]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the reload trigger
  useEffect(() => {
    // First load, or a different player: nothing was just written, load now.
    if (loadedFor.current?.token !== token || loadedFor.current === null) {
      loadedFor.current = { token };
      load();
      return;
    }
    const timer = setTimeout(load, INDEX_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [load, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    load();
  }, [load]);

  return { data, status, retry };
}
