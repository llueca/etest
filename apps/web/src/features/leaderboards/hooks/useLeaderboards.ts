import { useCallback, useEffect, useRef, useState } from "react";
import { getLeaderboards, type LeaderboardsResponse } from "../../../lib/api.ts";

export interface Leaderboards {
  data: LeaderboardsResponse | null;
  status: "loading" | "ready" | "error";
  retry(): void;
}

/**
 * Loads both leaderboards. They are not streamed: they reload when `reloadKey`
 * changes (the player's settlement or rename) and on retry. Previous data stays
 * visible while reloading.
 */
export function useLeaderboards(token: string | undefined, reloadKey: string): Leaderboards {
  const [data, setData] = useState<LeaderboardsResponse | null>(null);
  const [status, setStatus] = useState<Leaderboards["status"]>("loading");
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey and attempt are the reload triggers
  useEffect(() => {
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
  }, [token, reloadKey, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  return { data, status, retry };
}
