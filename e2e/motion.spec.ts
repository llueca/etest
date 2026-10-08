import type { Page } from "@playwright/test";
import { expect as playwrightExpect, test } from "@playwright/test";
import { StubMarketControl } from "../tests/harness/stub-market.ts";

const expect = playwrightExpect.configure({ timeout: 2_500 });
const market = new StubMarketControl("http://127.0.0.1:4174/__control");

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(2_500);
  await market.reset();
});

function upButton(page: Page) {
  return page.getByRole("button", { name: /\bUP\b|higher/i });
}

function downButton(page: Page) {
  return page.getByRole("button", { name: /\bDOWN\b|lower/i });
}

async function openGame(page: Page) {
  await page.goto("/");
  await page
    .getByText(/Player-\d{4}/)
    .first()
    .waitFor({ state: "attached" });

  const instructions = page.getByRole("dialog", { name: "How to play" });
  if (await instructions.count()) {
    await instructions.waitFor({ state: "visible" });
    await instructions.getByRole("checkbox", { name: "Don't show again" }).check();
    await instructions.getByRole("button", { name: "Got it" }).click();
  }
}

function tickerMessage(productId: string, price: string, sequence: number) {
  return JSON.stringify({
    type: "ticker",
    sequence,
    product_id: productId,
    price,
    open_24h: price,
    volume_24h: "1000.00000000",
    low_24h: price,
    high_24h: price,
    volume_30d: "30000.00000000",
    best_bid: price,
    best_bid_size: "0.01000000",
    best_ask: price,
    best_ask_size: "0.01000000",
    side: "buy",
    time: new Date().toISOString(),
    trade_id: sequence,
    last_size: "0.00100000",
  });
}

async function connectToSilentMarket(page: Page) {
  await market.update({ silent: true });
  const socketPromise = page.waitForEvent("websocket", { timeout: 5_000 });
  const subscribePromise = socketPromise.then((socket) =>
    socket.waitForEvent("framesent", {
      predicate: ({ payload }) => {
        try {
          return JSON.parse(String(payload)).type === "subscribe";
        } catch {
          return false;
        }
      },
      timeout: 5_000,
    }),
  );
  await openGame(page);
  await subscribePromise;
  return page.evaluate(async () => {
    const response = await fetch("/config.json");
    const config = (await response.json()) as { marketProductId: string };
    return config.marketProductId;
  });
}

async function emitPrice(productId: string, price: string, sequence: number) {
  await market.update({ emitRaw: tickerMessage(productId, price, sequence) });
}

async function openChartWithTwoObservations(page: Page) {
  const productId = await connectToSilentMarket(page);
  const price = "67500.00";
  await emitPrice(productId, price, 1);
  await expect(page.getByText(formattedPrice(Number(price)), { exact: true })).toBeVisible();
  await page.waitForTimeout(1_050);
  await emitPrice(productId, price, 2);

  const chart = page.getByRole("figure");
  await expect(chart).toBeVisible();
  await expect
    .poll(() => priceAxisLabels(chart).then((labels) => labels.length), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(3);
  return productId;
}

function formattedPrice(price: number) {
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function priceAxisLabels(figure: import("@playwright/test").Locator) {
  return figure.locator("text").evaluateAll((nodes) =>
    nodes
      .map((node) => node.textContent?.trim() ?? "")
      .filter((text) => !/^\d{2}:\d{2}:\d{2}$/.test(text))
      .filter((text) => /^\$?\d[\d,]*(?:\.\d+)?$/.test(text))
      .map((text) => Number(text.replace(/[,$]/g, ""))),
  );
}

async function visibleTimeLabels(figure: import("@playwright/test").Locator) {
  return figure.locator("text").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() ?? "",
          x: bounds.x + bounds.width / 2,
          visible: bounds.width > 0 && bounds.height > 0,
        };
      })
      .filter((label) => label.visible && /^\d{2}:\d{2}:\d{2}$/.test(label.text))
      .map(({ text, x }) => ({ text, x })),
  );
}

async function mutationFrames(figure: import("@playwright/test").Locator, durationMs: number) {
  return figure.evaluate(
    (element, duration) =>
      new Promise<number>((resolve) => {
        let framesWithChanges = 0;
        let frameScheduled = false;
        let finished = false;
        const observer = new MutationObserver((records) => {
          if (records.length === 0 || frameScheduled || finished) return;
          frameScheduled = true;
          requestAnimationFrame(() => {
            if (!finished) framesWithChanges++;
            frameScheduled = false;
          });
        });
        observer.observe(element, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        window.setTimeout(() => {
          finished = true;
          observer.disconnect();
          resolve(framesWithChanges);
        }, duration);
      }),
    durationMs,
  );
}

function expectSameBox(
  before: { x: number; y: number; width: number; height: number } | null,
  after: { x: number; y: number; width: number; height: number } | null,
) {
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  if (!before || !after) return;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.5);
}

test.describe("chart motion", () => {
  test("redraws the chart many times per second when reduced motion is not requested", async ({
    page,
  }) => {
    await openChartWithTwoObservations(page);
    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();

    const changedFrames = await mutationFrames(chart, 1_000);
    expect(changedFrames).toBeGreaterThanOrEqual(20);
  });

  test("limits chart redraws to about twice per second with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openChartWithTwoObservations(page);
    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();

    // Five changed frames in two seconds allows frame-boundary tolerance while
    // rejecting continuous display-rate movement.
    const changedFrames = await mutationFrames(chart, 2_000);
    expect(changedFrames).toBeLessThanOrEqual(5);
  });

  test("describes the latest displayed price after two events less than one second apart", async ({
    page,
  }) => {
    const productId = await connectToSilentMarket(page);
    const chart = page.getByRole("figure");

    const firstPrice = 67_501.25;
    const firstEventStartedAt = Date.now();
    await emitPrice(productId, firstPrice.toFixed(2), 1);
    await expect(page.getByText(formattedPrice(firstPrice), { exact: true })).toBeVisible();
    await expect
      .poll(() => chart.getAttribute("aria-label"), { timeout: 500 })
      .toContain(formattedPrice(firstPrice));

    const secondPrice = 67_502.5;
    const secondEventStartedAt = Date.now();
    expect(secondEventStartedAt - firstEventStartedAt).toBeLessThan(1_000);
    await emitPrice(productId, secondPrice.toFixed(2), 2);
    await expect(page.getByText(formattedPrice(secondPrice), { exact: true })).toBeVisible();
    await expect
      .poll(() => chart.getAttribute("aria-label"), { timeout: 500 })
      .toContain(formattedPrice(secondPrice));
  });

  test("keeps the price-axis labels unchanged for a price inside the current range", async ({
    page,
  }) => {
    const productId = await openChartWithTwoObservations(page);
    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();

    const initialLabels = await priceAxisLabels(chart);
    const lowerBound = Math.min(...initialLabels);
    const upperBound = Math.max(...initialLabels);
    const inRangePrice = Math.round((lowerBound + (upperBound - lowerBound) * 0.8) * 100) / 100;
    expect(inRangePrice).toBeGreaterThan(lowerBound);
    expect(inRangePrice).toBeLessThan(upperBound);

    await page.waitForTimeout(1_050);
    await emitPrice(productId, inRangePrice.toFixed(2), 3);
    await expect(page.getByText(formattedPrice(inRangePrice), { exact: true })).toBeVisible();
    await expect
      .poll(() => chart.getAttribute("aria-label"), { timeout: 750 })
      .toContain(formattedPrice(inRangePrice));
    expect(await priceAxisLabels(chart)).toEqual(initialLabels);
  });

  test("expands to cover a breakout using an even round-number price scale", async ({ page }) => {
    const productId = await openChartWithTwoObservations(page);
    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();
    const initialLabels = await priceAxisLabels(chart);

    const breakoutPrice = 69_000;
    await page.waitForTimeout(1_050);
    await emitPrice(productId, breakoutPrice.toFixed(2), 3);
    await expect(page.getByText(formattedPrice(breakoutPrice), { exact: true })).toBeVisible();
    await expect
      .poll(() => chart.getAttribute("aria-label"), { timeout: 750 })
      .toContain(formattedPrice(breakoutPrice));

    const breakoutLabels = await priceAxisLabels(chart);
    expect(breakoutLabels).not.toEqual(initialLabels);
    expect(breakoutLabels.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...breakoutLabels)).toBeLessThanOrEqual(breakoutPrice);
    expect(Math.max(...breakoutLabels)).toBeGreaterThanOrEqual(breakoutPrice);

    const sortedLabels = [...breakoutLabels].sort((a, b) => a - b);
    expect(sortedLabels.length).toBeGreaterThanOrEqual(2);
    const steps: number[] = [];
    for (let index = 1; index < sortedLabels.length; index++) {
      const previous = sortedLabels[index - 1];
      const current = sortedLabels[index];
      if (previous === undefined || current === undefined) {
        throw new Error("Expected consecutive price-axis labels");
      }
      steps.push(current - previous);
    }
    const step = steps[0];
    expect(step).toBeDefined();
    if (step === undefined) return;
    expect(step).toBeGreaterThanOrEqual(1);
    for (const nextStep of steps) expect(Math.abs(nextStep - step)).toBeLessThanOrEqual(0.01);

    const magnitude = 10 ** Math.floor(Math.log10(step));
    const normalizedStep = step / magnitude;
    expect([1, 2, 5].some((candidate) => Math.abs(normalizedStep - candidate) < 0.01)).toBe(true);
    for (const label of sortedLabels) {
      expect(Math.abs(label / step - Math.round(label / step))).toBeLessThan(0.000_001);
    }
  });

  test("keeps a visible time label while it moves left with the chart", async ({ page }) => {
    await openChartWithTwoObservations(page);
    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();
    await expect
      .poll(() => visibleTimeLabels(chart).then((labels) => labels.length), {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    const chartBounds = await chart.boundingBox();
    const visibleLabels = await visibleTimeLabels(chart);
    const chartCenter = chartBounds ? chartBounds.x + chartBounds.width / 2 : 0;
    const label = visibleLabels.sort(
      (a, b) => Math.abs(a.x - chartCenter) - Math.abs(b.x - chartCenter),
    )[0];
    expect(label).toBeDefined();
    if (!label) return;

    await page.waitForTimeout(1_500);
    const movedLabel = (await visibleTimeLabels(chart)).find(
      (candidate) => candidate.text === label.text,
    );
    expect(
      movedLabel,
      `Visible time labels after movement: ${JSON.stringify(await visibleTimeLabels(chart))}`,
    ).toBeDefined();
    if (movedLabel) expect(movedLabel.x).toBeLessThan(label.x - 0.5);
  });
});

test.describe("status and price motion", () => {
  test("shows LOSING immediately with a brief status transition and no layout movement", async ({
    page,
  }) => {
    const productId = await connectToSilentMarket(page);
    await emitPrice(productId, "67500.00", 1);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /\bUP\b|higher/i }).click();
    await expect(page.getByText(/Your prediction:\s*UP/i)).toBeVisible();
    await expect(page.getByText(/Time left:/)).toBeVisible();

    await emitPrice(productId, "67501.00", 2);
    await expect(page.getByText("WINNING", { exact: true })).toBeVisible();
    const controls = [upButton(page), downButton(page)];
    const boxesBefore = await Promise.all(controls.map((control) => control.boundingBox()));
    const countdown = page.getByText(/Time left:/);
    const countdownBefore = await countdown.boundingBox();
    const oldPrice = page.getByText("$67,501.00", { exact: true });
    const priceBefore = await oldPrice.boundingBox();

    await emitPrice(productId, "67499.00", 3);
    const losing = page.getByText("LOSING", { exact: true });
    await expect(losing).toBeVisible();
    const controlsAfter = await Promise.all(controls.map((control) => control.boundingBox()));
    for (let index = 0; index < controls.length; index++) {
      expectSameBox(boxesBefore[index] ?? null, controlsAfter[index] ?? null);
    }
    expectSameBox(countdownBefore, await countdown.boundingBox());
    const newPrice = page.getByText("$67,499.00", { exact: true });
    expectSameBox(priceBefore, await newPrice.boundingBox());
    expect(
      await newPrice.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === "running" || animation.pending).length,
      ),
    ).toBe(0);

    const transition = await losing.evaluate((element) =>
      element.getAnimations().map((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return {
          endTime: timing?.endTime ?? Number.POSITIVE_INFINITY,
        };
      }),
    );
    expect(transition.length).toBeGreaterThan(0);
    for (const animation of transition) expect(animation.endTime).toBeLessThanOrEqual(300);

    const finishedInTime = await losing.evaluate(async (element) => {
      const started = performance.now();
      const animations = element.getAnimations();
      if (animations.length === 0) return false;
      return Promise.race([
        Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(
          () => performance.now() - started <= 350,
        ),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 350)),
      ]);
    });
    expect(finishedInTime).toBe(true);
  });

  test("runs no animations with reduced motion and never animates the price text", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const productId = await connectToSilentMarket(page);
    await emitPrice(productId, "67500.00", 1);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /\bUP\b|higher/i }).click();
    await expect(page.getByText(/Your prediction:\s*UP/i)).toBeVisible();

    for (const [price, status, sequence] of [
      ["67501.00", "WINNING", 2],
      ["67499.00", "LOSING", 3],
      ["67502.00", "WINNING", 4],
    ] as const) {
      await emitPrice(productId, price, sequence);
      await expect(
        page.getByText(`$${Number(price).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText(status, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      const displayedPrice = page.getByText(
        `$${Number(price).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        { exact: true },
      );
      expect(
        await displayedPrice.evaluate(
          (element) =>
            element
              .getAnimations()
              .filter((animation) => animation.playState === "running" || animation.pending).length,
        ),
      ).toBe(0);
    }
  });
});
