import { afterEach, describe, expect, it } from "vitest";
import type { Stack } from "../harness/stack.ts";
import { startStack } from "../harness/stack.ts";

describe("chart window configuration contract", () => {
  let stack: Stack | undefined;

  afterEach(async () => {
    await stack?.stop();
    stack = undefined;
  });

  async function servedChartWindowSeconds() {
    if (!stack) throw new Error("Expected the stack to be running");
    const response = await fetch(`${stack.baseUrl}/config.json`);
    expect(response.status).toBe(200);
    const config = (await response.json()) as { chartWindowSeconds: number };
    return config.chartWindowSeconds;
  }

  it("serves the 120-second default when CHART_WINDOW_SECONDS is unset", async () => {
    const previousWindow = process.env.CHART_WINDOW_SECONDS;
    delete process.env.CHART_WINDOW_SECONDS;
    try {
      stack = await startStack();
      expect(await servedChartWindowSeconds()).toBe(120);
    } finally {
      await stack?.stop();
      stack = undefined;
      if (previousWindow === undefined) delete process.env.CHART_WINDOW_SECONDS;
      else process.env.CHART_WINDOW_SECONDS = previousWindow;
    }
  });

  it.each([60, 600])("serves the configured %i-second chart window", async (seconds) => {
    stack = await startStack({ env: { CHART_WINDOW_SECONDS: String(seconds) } });
    expect(await servedChartWindowSeconds()).toBe(seconds);
  });

  it.each([59, 601])("refuses to start with a %i-second chart window", async (seconds) => {
    let invalidStack: Stack | undefined;
    const previousWindow = process.env.CHART_WINDOW_SECONDS;
    try {
      const result = await startStack({ env: { CHART_WINDOW_SECONDS: String(seconds) } }).then(
        (started) => {
          invalidStack = started;
          return { outcome: "resolved" as const };
        },
        (error: unknown) => ({ outcome: "rejected" as const, error }),
      );
      expect(result.outcome).toBe("rejected");
      if (result.outcome === "rejected") {
        expect(String(result.error)).toMatch(/CHART_WINDOW_SECONDS|chart window/i);
      }
    } finally {
      await invalidStack?.stop();
      if (previousWindow === undefined) delete process.env.CHART_WINDOW_SECONDS;
      else process.env.CHART_WINDOW_SECONDS = previousWindow;
    }
  });
});
