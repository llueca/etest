import { describe, expect, it } from "vitest";
import { runSettlerLoop } from "./settler-loop.ts";

/** Fake clock: sleeping advances time instantly. */
function fakeWorld(options: { pendingUntil: number }) {
  let time = 1_000_000;
  const passes: number[] = [];
  return {
    passes,
    deps: {
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      pass: async (now: Date) => {
        passes.push(now.getTime() - 1_000_000);
      },
      // Something is pending for this run until `pendingUntil` ms after the start.
      hasPendingBefore: async () => time - 1_000_000 < options.pendingUntil,
    },
  };
}

describe("settler loop", () => {
  it("exits after one pass when nothing is pending in this run", async () => {
    const world = fakeWorld({ pendingUntil: 0 });
    await runSettlerLoop(world.deps, { runMs: 60_000, pollIntervalMs: 1_000 });
    expect(world.passes).toEqual([0]);
  });

  it("keeps polling at the interval while something is pending", async () => {
    const world = fakeWorld({ pendingUntil: 3_000 });
    await runSettlerLoop(world.deps, { runMs: 60_000, pollIntervalMs: 1_000 });
    expect(world.passes).toEqual([0, 1_000, 2_000, 3_000]);
  });

  it("stops at the end of its run even if work remains", async () => {
    const world = fakeWorld({ pendingUntil: Number.POSITIVE_INFINITY });
    await runSettlerLoop(world.deps, { runMs: 5_000, pollIntervalMs: 1_000 });
    expect(world.passes).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
  });
});
