import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, json, mockApi, player, webConfig, withServerTime } from "../test/utils.ts";
import { App } from "./App.tsx";

const STORAGE_KEY = "btc-game.playerId";
const emptyBoards = () =>
  json(withServerTime({ score: { entries: [] }, predictor: { entries: [] } }));
const me = (overrides: Record<string, unknown> = {}) =>
  json(withServerTime({ player: player(overrides), activePrediction: null, lastResult: null }));

const statLines = () =>
  within(screen.getByRole("region", { name: "Your statistics" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

beforeEach(() => FakeWebSocket.install());

describe("startup", () => {
  it("shows a loading state instead of a score of 0 while the player loads", async () => {
    localStorage.setItem(STORAGE_KEY, "stored");
    mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => new Promise<Response>(() => {}),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(await screen.findByText("Loading your player…")).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("creates and stores a player on a first visit", async () => {
    const calls = mockApi({
      "GET /config.json": () => json(webConfig),
      "POST /api/players": () =>
        json(
          withServerTime({ playerId: "new-id", player: player({ displayName: "Player-1234" }) }),
          201,
        ),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(await screen.findByText("Player-1234")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("new-id");
    expect(statLines()).toContain("Score: 0");
    expect(calls.some((c) => c.route === "GET /api/me")).toBe(false);
  });

  it("restores the stored player instead of creating one", async () => {
    localStorage.setItem(STORAGE_KEY, "stored");
    const calls = mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => me({ score: 7, displayName: "Dario" }),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(await screen.findByText("Dario")).toBeInTheDocument();
    expect(statLines()).toContain("Score: 7");
    expect(calls.some((c) => c.route === "POST /api/players")).toBe(false);
  });

  it("replaces an identifier the server does not recognise with a new player's", async () => {
    localStorage.setItem(STORAGE_KEY, "stale");
    mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => json({ error: { code: "unauthorized", message: "no" } }, 401),
      "POST /api/players": () => json(withServerTime({ playerId: "fresh", player: player() }), 201),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    await screen.findByText("Player-0001");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("fresh");
  });

  it("keeps the stored identifier on a temporary failure and restores the same player on retry", async () => {
    localStorage.setItem(STORAGE_KEY, "stored");
    let reachable = false;
    const calls = mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => {
        if (!reachable) throw new TypeError("offline");
        return me({ score: 7 });
      },
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(await screen.findByText("Your progress could not be loaded")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("stored");
    expect(calls.some((c) => c.route === "POST /api/players")).toBe(false);

    reachable = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Player-0001");
    expect(statLines()).toContain("Score: 7");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("stored");
    expect(calls.some((c) => c.route === "POST /api/players")).toBe(false);
  });

  it("gives up on a player request that never answers after 15 s, keeping the identifier", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, "stored");
    const calls = mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => new Promise<Response>(() => {}),
    });
    render(<App />);
    // Let config.json and the start of the player request resolve before moving the clock far.
    await act(() => vi.advanceTimersByTimeAsync(100));
    await act(() => vi.advanceTimersByTimeAsync(14_800));
    expect(screen.getByText("Loading your player…")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByText("Your progress could not be loaded")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("stored");
    expect(calls.some((c) => c.route === "POST /api/players")).toBe(false);
  });

  it("shows the configuration error when config.json never answers", async () => {
    vi.useFakeTimers();
    mockApi({ "GET /config.json": () => new Promise<Response>(() => {}) });
    render(<App />);
    await act(() => vi.advanceTimersByTimeAsync(15_100));
    expect(screen.getByText("The game is not configured correctly")).toBeInTheDocument();
  });

  it("keeps the identifier when the server answers with an error status", async () => {
    localStorage.setItem(STORAGE_KEY, "stored");
    mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => json({ error: { code: "internal_error", message: "boom" } }, 500),
    });
    render(<App />);
    expect(await screen.findByText("Your progress could not be loaded")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("stored");
  });

  it("shows a configuration error when config.json cannot be loaded, and can retry", async () => {
    let healthy = false;
    mockApi({
      "GET /config.json": () => (healthy ? json(webConfig) : json({}, 500)),
      "POST /api/players": () => json(withServerTime({ playerId: "id", player: player() }), 201),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(await screen.findByText("The game is not configured correctly")).toBeInTheDocument();
    healthy = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Player-0001")).toBeInTheDocument();
  });

  it("treats an invalid config.json as a configuration error", async () => {
    mockApi({ "GET /config.json": () => json({ ...webConfig, nameMaxLength: 0 }) });
    render(<App />);
    expect(await screen.findByText("The game is not configured correctly")).toBeInTheDocument();
  });
});
