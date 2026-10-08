import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi, withServerTime } from "../../../test/utils.ts";
import { useLeaderboards } from "./useLeaderboards.ts";

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

let calls: ReturnType<typeof mockApi>;
const requests = () => calls.filter((c) => c.route === "GET /api/leaderboards");

beforeEach(() => {
  vi.useFakeTimers();
  calls = mockApi({
    "GET /api/leaderboards": () =>
      json(withServerTime({ score: { entries: [] }, predictor: { entries: [] } })),
  });
});

describe("useLeaderboards", () => {
  it("loads immediately on start", async () => {
    const { result } = renderHook(() => useLeaderboards("token", "none|Player-0001"));
    await advance(10);
    expect(requests()).toHaveLength(1);
    expect(result.current.status).toBe("ready");
  });

  it("reloads immediately when the player (token) changes", async () => {
    const { rerender } = renderHook(({ token }) => useLeaderboards(token, "none|"), {
      initialProps: { token: undefined as string | undefined },
    });
    await advance(10);
    rerender({ token: "token" });
    await advance(10);
    expect(requests().map((r) => r.token)).toEqual([undefined, "token"]);
  });

  it("waits 1.5 s after the player's own settlement or rename, so the indexes have caught up", async () => {
    const { rerender, result } = renderHook(({ key }) => useLeaderboards("token", key), {
      initialProps: { key: "none|Player-0001" },
    });
    await advance(10);
    rerender({ key: "result-1|Player-0001" });
    await advance(1_400);
    expect(requests()).toHaveLength(1);
    // The previous boards stay visible while waiting.
    expect(result.current.status).toBe("ready");

    await advance(100);
    expect(requests()).toHaveLength(2);
  });

  it("makes one request for changes in quick succession", async () => {
    const { rerender } = renderHook(({ key }) => useLeaderboards("token", key), {
      initialProps: { key: "none|Player-0001" },
    });
    await advance(10);
    rerender({ key: "result-1|Player-0001" });
    await advance(500);
    rerender({ key: "result-1|Dario" });
    await advance(1_500);
    expect(requests()).toHaveLength(2);
  });

  it("retries immediately", async () => {
    const { result } = renderHook(() => useLeaderboards("token", "none|Player-0001"));
    await advance(10);
    act(() => result.current.retry());
    await advance(10);
    expect(requests()).toHaveLength(2);
  });
});
