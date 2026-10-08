import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeWebSocket,
  json,
  mockApi,
  player,
  ticker,
  webConfig,
  withServerTime,
} from "../test/utils.ts";
import { App } from "./App.tsx";

const STORAGE_KEY = "btc-game.playerId";

const prediction = (eligibleAt: number, overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  direction: "up",
  entryPrice: 67_500,
  createdAt: eligibleAt - 60_000,
  eligibleAt,
  status: "pending",
  ...overrides,
});

const wonResult = (eligibleAt: number) => ({
  ...prediction(eligibleAt),
  status: "won",
  settlementPrice: 67_540,
  settledAt: eligibleAt + 500,
  scoreDelta: 1,
  scoreBefore: 6,
  scoreAfter: 7,
});

const up = () => screen.getByRole("button", { name: "Predict higher (UP)" });
const down = () => screen.getByRole("button", { name: "Predict lower (DOWN)" });
const flush = (ms = 20) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Synchronous click: user-event cannot drive Vitest fake timers. Disabled buttons ignore it, as in a browser. */
const click = async (element: HTMLElement) => {
  fireEvent.click(element);
  await flush();
};

interface World {
  me: { player: object; activePrediction: object | null; lastResult: object | null };
  /** Handler for POST /api/me/predictions. */
  place: () => Response | Promise<Response>;
  /** While true, GET /api/me fails without a response, like a lost connection. */
  meOffline?: boolean;
  /**
   * While true, GET /api/me captures the state at request time but only answers when its
   * release function in `held` is called, so responses can arrive in any order.
   */
  holdMe?: boolean;
  held?: (() => void)[];
}

/** Mounts the whole app against a scripted API and a fake market feed. */
async function mount(world: World) {
  localStorage.setItem(STORAGE_KEY, "player-id");
  FakeWebSocket.install();
  const calls = mockApi({
    "GET /config.json": () => json(webConfig),
    "GET /api/me": () => {
      if (world.meOffline) throw new TypeError("offline");
      const response = json(withServerTime(world.me));
      if (!world.holdMe) return response;
      return new Promise<Response>((resolve) => {
        world.held = [...(world.held ?? []), () => resolve(response)];
      });
    },
    "POST /api/me/predictions": () => world.place(),
    "GET /api/leaderboards": () =>
      json(withServerTime({ score: { entries: [] }, predictor: { entries: [] } })),
  });
  render(<App />);
  await flush(100); // config, then the player, resolve on microtasks
  expect(up()).toBeInTheDocument();
  return calls;
}

const feed = async (price: string) => {
  act(() => FakeWebSocket.latest.message(ticker(price)));
  await flush();
};
const goLive = async (price = "67500.00") => {
  act(() => FakeWebSocket.latest.open());
  await feed(price);
};

beforeEach(() => {
  vi.useFakeTimers();
});

const startWorld = (): World => ({
  me: { player: player(), activePrediction: null, lastResult: null },
  place: () => {
    throw new Error("no prediction expected");
  },
});

describe("prediction controls against the live feed", () => {
  it("are disabled until the first price, enabled while live, and disabled again when stale", async () => {
    await mount(startWorld());
    expect(up()).toBeDisabled();
    expect(down()).toBeDisabled();
    expect(up()).toHaveAccessibleDescription(/connecting/i);

    await goLive();
    expect(up()).toBeEnabled();
    expect(down()).toBeEnabled();

    await flush(9_900);
    expect(up()).toBeEnabled();
    await flush(100);
    expect(up()).toBeDisabled();
    expect(up()).toHaveAccessibleDescription(/stale/i);

    await feed("67501.00");
    expect(up()).toBeEnabled();
  });
});

describe("placing a prediction", () => {
  it("locks both controls while the request is in flight and sends exactly one request", async () => {
    let respond: (response: Response) => void = () => {};
    const world = startWorld();
    world.place = () => new Promise<Response>((resolve) => (respond = resolve));
    const calls = await mount(world);
    await goLive();

    await click(up());
    expect(up()).toBeDisabled();
    expect(down()).toBeDisabled();
    expect(up()).toHaveAccessibleDescription("Starting your prediction…");

    await click(up());
    await click(down());
    expect(calls.filter((c) => c.route === "POST /api/me/predictions")).toHaveLength(1);
    expect(calls.find((c) => c.route === "POST /api/me/predictions")?.body).toEqual({
      direction: "up",
    });

    respond(json(withServerTime({ prediction: prediction(Date.now() + 60_000) }), 201));
    await flush();
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
    expect(up()).toBeDisabled();
    expect(up()).toHaveAccessibleDescription("A prediction is in progress.");
  });

  it("shows a retryable error after a provider failure and re-enables the controls", async () => {
    const world = startWorld();
    world.place = () => json({ error: { code: "price_unavailable", message: "Try again" } }, 503);
    await mount(world);
    await goLive();

    await click(up());
    await flush();
    expect(screen.getByText(/could not start your prediction.*try again/i)).toBeInTheDocument();
    expect(up()).toBeEnabled();
    expect(screen.queryByText("Resolving…")).not.toBeInTheDocument();
    expect(screen.queryByText(/time left/i)).not.toBeInTheDocument();
  });

  it("shows the prediction when an unknown outcome turns out to have created it", async () => {
    const world = startWorld();
    world.place = () => {
      world.me.activePrediction = prediction(Date.now() + 55_000, { direction: "down" });
      throw new TypeError("network timeout"); // the response was lost
    };
    await mount(world);
    await goLive();

    await click(down());
    await flush();
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
    expect(screen.getByText("DOWN")).toBeInTheDocument();
    // The outcome is known now: no contradicting "try again" message.
    expect(screen.queryByText(/could not start/i)).not.toBeInTheDocument();
  });

  it("treats a prediction request that never answers as an unknown outcome after 15 s", async () => {
    const world = startWorld();
    world.place = () => {
      // The server created the prediction, but its answer never arrives.
      world.me.activePrediction = prediction(Date.now() + 55_000);
      return new Promise<Response>(() => {});
    };
    await mount(world);
    await goLive();

    await click(up());
    await flush(14_900);
    expect(up()).toHaveAccessibleDescription("Starting your prediction…");

    await flush(200);
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
    expect(up()).toHaveAccessibleDescription("A prediction is in progress.");
    expect(screen.queryByText(/could not start/i)).not.toBeInTheDocument();
  });

  describe("when the outcome is unknown and the re-sync fails too", () => {
    /** The request is lost, then the connection stays down: the server state is not known. */
    const offlineAfterLostRequest = async (created: boolean) => {
      const world = startWorld();
      world.place = () => {
        world.meOffline = true;
        if (created) world.me.activePrediction = prediction(Date.now() + 55_000);
        throw new TypeError("network timeout");
      };
      await mount(world);
      await goLive();
      await click(up());
      await flush();
      return world;
    };

    it("keeps UP and DOWN blocked and says the prediction could not be confirmed", async () => {
      await offlineAfterLostRequest(false);

      expect(up()).toBeDisabled();
      expect(down()).toBeDisabled();
      expect(up()).toHaveAccessibleDescription(/confirm/i);
      expect(screen.getByText(/could not confirm/i)).toBeInTheDocument();
      expect(screen.queryByText(/could not start your prediction/i)).not.toBeInTheDocument();
    });

    it("unblocks with a retryable error once a check shows that nothing was created", async () => {
      const world = await offlineAfterLostRequest(false);

      await click(screen.getByRole("button", { name: "Check again" }));
      expect(up()).toBeDisabled(); // still offline

      world.meOffline = false;
      await click(screen.getByRole("button", { name: "Check again" }));
      expect(up()).toBeEnabled();
      expect(screen.getByText(/could not start your prediction.*try again/i)).toBeInTheDocument();
      expect(screen.queryByText(/could not confirm/i)).not.toBeInTheDocument();
    });

    it("shows the prediction once a check shows that it was created", async () => {
      const world = await offlineAfterLostRequest(true);

      world.meOffline = false;
      await click(screen.getByRole("button", { name: "Check again" }));
      expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
      expect(screen.queryByText(/could not confirm|could not start/i)).not.toBeInTheDocument();
    });

    it("also unblocks when the tab becomes visible again and the server answers", async () => {
      const world = await offlineAfterLostRequest(false);

      world.meOffline = false;
      document.dispatchEvent(new Event("visibilitychange"));
      await flush();
      expect(up()).toBeEnabled();
      expect(screen.queryByText(/could not confirm/i)).not.toBeInTheDocument();
    });
  });

  it("keeps controls blocked after a conflict whose re-sync fails", async () => {
    const world = startWorld();
    world.place = () => {
      world.meOffline = true;
      return json({ error: { code: "prediction_already_active", message: "active" } }, 409);
    };
    await mount(world);
    await goLive();

    await click(down());
    await flush();
    expect(down()).toBeDisabled();
    expect(screen.getByText(/could not confirm/i)).toBeInTheDocument();
  });

  it("re-syncs to the existing prediction on a conflict, without an error", async () => {
    const world = startWorld();
    world.place = () => {
      world.me.activePrediction = prediction(Date.now() + 50_000);
      return json({ error: { code: "prediction_already_active", message: "active" } }, 409);
    };
    await mount(world);
    await goLive();

    await click(down());
    await flush();
    expect(screen.getByText("UP")).toBeInTheDocument();
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
    expect(screen.queryByText(/could not start/i)).not.toBeInTheDocument();
  });
});

describe("overlapping reads of the player", () => {
  const visible = () => document.dispatchEvent(new Event("visibilitychange"));
  const release = async (world: World, index: number) => {
    act(() => world.held?.[index]?.());
    await flush();
  };

  it("does not let an older read bring back a state that a newer read already replaced", async () => {
    const eligibleAt = Date.now() + 30_000;
    const world = startWorld();
    world.me.activePrediction = prediction(eligibleAt);
    await mount(world);
    await goLive();
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();

    world.holdMe = true;
    visible(); // read 0 starts while the prediction is still pending
    await flush();
    world.me = {
      player: player({ score: 7 }),
      activePrediction: null,
      lastResult: wonResult(eligibleAt),
    };
    visible(); // read 1 starts after settlement
    await flush();

    await release(world, 1);
    expect(screen.getByText("WIN", { exact: true })).toBeInTheDocument();
    await release(world, 0); // the older answer arrives last
    expect(screen.getByText("WIN", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Your prediction: UP/)).not.toBeInTheDocument();
  });

  it("does not let a read that started before a new prediction hide that prediction", async () => {
    const world = startWorld();
    world.place = () => json(withServerTime({ prediction: prediction(Date.now() + 60_000) }), 201);
    await mount(world);
    await goLive();

    world.holdMe = true;
    visible(); // read 0 starts while the player has no prediction
    await flush();
    world.holdMe = false;
    await click(up());
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();

    await release(world, 0); // the older answer still says "no prediction"
    expect(screen.getByText("Entry price: $67,500.00")).toBeInTheDocument();
    expect(up()).toBeDisabled();
  });
});

describe("announcements", () => {
  it("announces each important event once and stays silent for ticks, countdown and status flips", async () => {
    const eligibleAt = Date.now() + 60_000;
    const world = startWorld();
    world.place = () => json(withServerTime({ prediction: prediction(eligibleAt) }), 201);
    await mount(world);
    await goLive();

    const regions = document.querySelectorAll('[aria-live="polite"]');
    expect(regions).toHaveLength(1);
    const region = regions[0] as HTMLElement;
    const snapshots: string[] = [];
    new MutationObserver(() => snapshots.push(region.textContent ?? "")).observe(region, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    const latest = () => snapshots.at(-1) ?? "";

    /** Advance in 1 s steps with the feed alive, optionally changing price each second. */
    const run = async (seconds: number, price = () => "67500.00") => {
      for (let i = 0; i < seconds; i++) {
        act(() => FakeWebSocket.latest.message(ticker(price())));
        await flush(1_000);
      }
    };

    // Prediction placed: direction and entry price, once.
    await click(up());
    await flush();
    expect(snapshots).toHaveLength(1);
    expect(latest()).toMatch(/Your prediction: UP.*Entry price: \$67,500\.00/);

    // Price ticks, countdown seconds and WINNING/LOSING/TIED flips: nothing announced.
    const prices = ["67501.00", "67499.00", "67500.00", "67502.00"];
    let tick = 0;
    await run(8, () => prices[tick++ % prices.length] as string);
    expect(screen.getByText(/Time left: (5[0-9]) seconds/)).toBeInTheDocument();
    expect(snapshots).toHaveLength(1);

    // Resolving…, once.
    await run(52);
    expect(snapshots).toHaveLength(2);
    expect(latest()).toContain("Resolving…");

    // Result, once, with the win, +1 and the new score.
    world.me = {
      player: player({ score: 7 }),
      activePrediction: null,
      lastResult: wonResult(eligibleAt),
    };
    await run(2);
    expect(snapshots).toHaveLength(3);
    expect(latest()).toMatch(/WIN.*UP.*\+1.*Score: 6 → 7/);

    // Error, once.
    world.place = () => json({ error: { code: "price_unavailable", message: "x" } }, 503);
    await click(up());
    await flush();
    expect(snapshots).toHaveLength(4);
    expect(latest()).toContain("Could not start your prediction");

    // Feed lost and restored, once each.
    await flush(10_000);
    expect(snapshots).toHaveLength(5);
    expect(latest()).toContain("Live data lost.");
    await feed("67500.00");
    expect(snapshots).toHaveLength(6);
    expect(latest()).toContain("Live data restored.");
  });

  it("does not use any other live region, and keeps WINNING out of the announced text", async () => {
    const world = startWorld();
    world.me.activePrediction = prediction(Date.now() + 30_000);
    await mount(world);
    await goLive("67510.00");

    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(
      within(screen.getByRole("region", { name: "Your prediction" })).getByText("WINNING"),
    ).toBeInTheDocument();
    expect(region).not.toHaveTextContent(/WINNING|LOSING|TIED/);
    expect(region).not.toHaveTextContent(/seconds/);
  });
});
