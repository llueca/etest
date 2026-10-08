import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, json, mockApi, player, webConfig, withServerTime } from "../test/utils.ts";
import { App } from "./App.tsx";

const PLAYER_KEY = "btc-game.playerId";

const me = () =>
  json(withServerTime({ player: player(), activePrediction: null, lastResult: null }));
const emptyBoards = () =>
  json(withServerTime({ score: { entries: [] }, predictor: { entries: [] } }));

function mountGame(config: object = webConfig) {
  localStorage.setItem(PLAYER_KEY, "stored");
  mockApi({
    "GET /config.json": () => json(config),
    "GET /api/me": me,
    "GET /api/leaderboards": emptyBoards,
  });
  return render(<App />);
}

const dialog = () => screen.queryByRole("dialog", { name: "How to play" });
const checkbox = () => screen.getByRole("checkbox", { name: "Don't show again" });

beforeEach(() => FakeWebSocket.install());
afterEach(() => vi.restoreAllMocks());

describe("How to play dialog", () => {
  it("is open when the game screen appears", async () => {
    mountGame();
    expect(await screen.findByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
  });

  it("is not open on the loading or error screens", async () => {
    localStorage.setItem(PLAYER_KEY, "stored");
    mockApi({
      "GET /config.json": () => json(webConfig),
      "GET /api/me": () => json({ error: "unavailable" }, 503),
      "GET /api/leaderboards": emptyBoards,
    });
    render(<App />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(document.querySelector("dialog")).toBeNull();
    expect(await screen.findByText("Your progress could not be loaded")).toBeInTheDocument();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("is not open on the configuration error screen", async () => {
    mockApi({ "GET /config.json": () => json({}, 500) });
    render(<App />);

    expect(await screen.findByText("The game is not configured correctly")).toBeInTheDocument();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("states the configured prediction window", async () => {
    const { unmount } = mountGame();
    expect(await screen.findByText(/prediction window of 1 minute/)).toBeInTheDocument();
    unmount();

    mountGame({ ...webConfig, predictionWindowSeconds: 90 });
    expect(await screen.findByText(/prediction window of 90 seconds/)).toBeInTheDocument();
  });

  it("closes with Got it and does not reopen on its own", async () => {
    const user = userEvent.setup();
    mountGame();
    await screen.findByRole("dialog", { name: "How to play" });

    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(dialog()).toBeNull();
    expect(screen.getByRole("button", { name: "How to play" })).toHaveFocus();

    // Later renders (price ticks, polling) never reopen it.
    FakeWebSocket.latest.open();
    FakeWebSocket.latest.message({ type: "ticker", product_id: "BTC-USD", price: "67500.00" });
    expect(await screen.findByText("$67,500.00", { selector: "p.price" })).toBeInTheDocument();
    expect(dialog()).toBeNull();
  });

  it("can be reopened with the How to play button", async () => {
    const user = userEvent.setup();
    mountGame();
    await screen.findByRole("dialog", { name: "How to play" });
    await user.click(screen.getByRole("button", { name: "Got it" }));

    await user.click(screen.getByRole("button", { name: "How to play" }));
    expect(dialog()).toBeInTheDocument();
  });

  it("is not opened on the next load after Don't show again, and the choice can be reversed", async () => {
    const user = userEvent.setup();
    const first = mountGame();
    await screen.findByRole("dialog", { name: "How to play" });
    expect(checkbox()).not.toBeChecked();
    await user.click(checkbox());
    await user.click(screen.getByRole("button", { name: "Got it" }));
    first.unmount();

    const second = mountGame();
    expect(await screen.findByRole("button", { name: "How to play" })).toBeInTheDocument();
    expect(dialog()).toBeNull();

    await user.click(screen.getByRole("button", { name: "How to play" }));
    expect(checkbox()).toBeChecked();
    await user.click(checkbox());
    await user.click(screen.getByRole("button", { name: "Got it" }));
    second.unmount();

    mountGame();
    expect(await screen.findByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });

  it("keeps opening, without an error, when the browser cannot store the choice", async () => {
    const user = userEvent.setup();
    const realGet = Storage.prototype.getItem;
    const realSet = Storage.prototype.setItem;
    const realRemove = Storage.prototype.removeItem;
    const isPreference = (key: string) => key.includes("hideInstructions");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (isPreference(key)) throw new Error("storage unavailable");
      return realGet.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (isPreference(key)) throw new Error("storage unavailable");
      realSet.call(this, key, value);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (isPreference(key)) throw new Error("storage unavailable");
      realRemove.call(this, key);
    });

    const first = mountGame();
    await screen.findByRole("dialog", { name: "How to play" });
    await user.click(checkbox());
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    first.unmount();

    mountGame();
    expect(await screen.findByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });
});
