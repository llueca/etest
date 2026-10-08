import AxeBuilder from "@axe-core/playwright";
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

function nameInput(page: Page) {
  return page.getByRole("textbox", { name: /display name|name/i });
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

async function placePrediction(page: Page, direction: "UP" | "DOWN") {
  await (direction === "UP" ? upButton(page) : downButton(page)).click();
}

test.describe("player identity", () => {
  test("creates an anonymous player on first visit and restores it after reload", async ({
    page,
  }) => {
    await openGame(page);

    await expect(page.getByText(/Player-\d{4}/)).toBeVisible();
    await expect(page.getByText(/score\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/games played\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/wins\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/losses\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/current streak\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/best streak\s*:?\s*0/i)).toBeVisible();
    await expect(page.getByText(/accuracy\s*:?\s*—/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email|password/i })).toHaveCount(0);

    const originalName = await page.getByText(/Player-\d{4}/).textContent();
    await page.reload();
    await expect(page.getByText(originalName ?? "", { exact: true })).toBeVisible();
    await expect(page.getByText(/score\s*:?\s*0/i)).toBeVisible();
  });

  test("saves a valid display name and confirms success", async ({ page }) => {
    await openGame(page);
    await page.getByRole("button", { name: /edit.*name|change.*name/i }).click();
    await nameInput(page).fill("Dario");
    await page.getByRole("button", { name: /save|update|confirm/i }).click();

    await expect(page.getByText("Dario", { exact: true })).toBeVisible();
    await expect(page.getByText(/saved|updated|name changed/i)).toBeVisible();
  });

  test("keeps invalid name text and associates the validation error with its input", async ({
    page,
  }) => {
    await openGame(page);
    await page.getByRole("button", { name: /edit.*name|change.*name/i }).click();
    const input = nameInput(page);
    const tooLongName = "n".repeat(25);
    await input.fill(tooLongName);
    await page.getByRole("button", { name: /save|update|confirm/i }).click();

    const validationAlert = page.getByRole("alert");
    await expect(validationAlert).toBeVisible();
    await expect(validationAlert).toContainText(/24|maximum|too long|characters/i);
    await expect(input).toHaveValue(tooLongName);
    await expect(input).toHaveAccessibleDescription(/.+/);
  });

  test("cancels name editing with Escape without changing the displayed name", async ({ page }) => {
    await openGame(page);
    const originalName = await page.getByText(/Player-\d{4}/).textContent();
    await page.getByRole("button", { name: /edit.*name|change.*name/i }).click();
    await nameInput(page).fill("Not saved");
    await nameInput(page).press("Escape");

    await expect(page.getByText(originalName ?? "", { exact: true })).toBeVisible();
    await expect(nameInput(page)).toHaveCount(0);
  });
});

test.describe("live market feed", () => {
  test("formats live prices in USD with two decimals and updates on a market event", async ({
    page,
  }) => {
    await openGame(page);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();

    await market.setPrice("67503.42");
    await expect(page.getByText("$67,503.42", { exact: true })).toBeVisible();
  });

  test("keeps prediction controls in place without reloading when the price changes", async ({
    page,
  }) => {
    let loadEvents = 0;
    page.on("load", () => loadEvents++);
    await openGame(page);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await expect(upButton(page)).toBeVisible();
    await expect(downButton(page)).toBeVisible();
    const upPosition = await upButton(page).boundingBox();
    const downPosition = await downButton(page).boundingBox();

    await market.setPrice("67511.18");
    await expect(page.getByText("$67,511.18", { exact: true })).toBeVisible();
    expect(loadEvents).toBe(1);
    expect(await upButton(page).boundingBox()).toEqual(upPosition);
    expect(await downButton(page).boundingBox()).toEqual(downPosition);
  });

  test("shows a connecting state and disables prediction controls until the first price", async ({
    page,
  }) => {
    await market.update({ refuseConnections: true, silent: true });
    await openGame(page);

    await expect(page.getByText(/connecting/i)).toBeVisible();
    await expect(upButton(page)).toBeDisabled();
    await expect(downButton(page)).toBeDisabled();
    await expect(page.getByText("$67,500.00", { exact: true })).toHaveCount(0);
  });

  test("ignores malformed and wrong-product ticker messages", async ({ page }) => {
    await openGame(page);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await market.update({ silent: true });

    await market.update({
      emitRaw: JSON.stringify({ type: "ticker", product_id: "BTC-USD", price: "not-a-price" }),
    });
    await market.update({ emitRaw: JSON.stringify({ type: "ticker", product_id: "BTC-USD" }) });
    await market.update({
      emitRaw: JSON.stringify({ type: "ticker", product_id: "ETH-USD", price: "68000.00" }),
    });

    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await expect(page.getByText("$68,000.00", { exact: true })).toHaveCount(0);
  });

  test("marks quiet data stale, blocks predictions, and enables them when fresh data returns", async ({
    page,
  }) => {
    await page.clock.install();
    await openGame(page);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await market.update({ silent: true });
    await page.clock.fastForward(10_100);

    await expect(page.getByText(/stale|unavailable|not live/i)).toBeVisible();
    await expect(upButton(page)).toBeDisabled();
    await expect(downButton(page)).toBeDisabled();

    await market.update({ silent: false, price: "67501.23" });
    await expect(page.getByText("$67,501.23", { exact: true })).toBeVisible();
    await expect(page.getByText(/stale|unavailable|not live/i)).toHaveCount(0);
    await expect(upButton(page)).toBeEnabled();
    await expect(downButton(page)).toBeEnabled();
  });

  test("reconnects after the market connection drops and resumes price updates", async ({
    page,
  }) => {
    await openGame(page);
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await market.update({ drop: true, refuseConnections: true });

    await expect(page.getByText(/reconnecting|connecting/i)).toBeVisible();
    await market.update({ refuseConnections: false, price: "67512.34" });
    await expect(page.getByText("$67,512.34", { exact: true })).toBeVisible();
  });

  test("shows an accessible chart while recent observations are being collected", async ({
    page,
  }) => {
    await market.update({ silent: true });
    await openGame(page);

    const chart = page.getByRole("figure");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("aria-label", /.+/);
    await expect(page.getByText(/collecting.*(price|data)|collecting recent/i)).toBeVisible();
  });
});

test.describe("predictions", () => {
  test("places UP with the server entry price, countdown, resolving state and chart reference", async ({
    page,
  }) => {
    await page.clock.install();
    await openGame(page);
    await placePrediction(page, "UP");

    await expect(page.getByText(/UP/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await expect(page.getByText(/\b(?:[1-5]?\d|60)\s*(?:seconds?|s)\b/i)).toBeVisible();
    const chart = page.getByRole("figure");
    await expect(chart.getByText("$67,500.00", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText(/UP/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await expect(page.getByText(/\b(?:[1-5]?\d|60)\s*(?:seconds?|s)\b/i)).toBeVisible();

    await page.clock.fastForward(61_000);
    await expect(page.getByText("Resolving…", { exact: true })).toBeVisible();
    await expect(page.getByText(/-\d+\s*(?:seconds?|s)/i)).toHaveCount(0);
  });

  test("places DOWN and shows live status at one-cent precision", async ({ page }) => {
    await openGame(page);
    await placePrediction(page, "DOWN");
    await expect(page.getByText(/DOWN/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();

    await market.setPrice("67499.99");
    await expect(page.getByText("WINNING", { exact: true })).toBeVisible();
    await market.setPrice("67500.01");
    await expect(page.getByText("LOSING", { exact: true })).toBeVisible();
    await market.setPrice("67500.00");
    await expect(page.getByText("TIED", { exact: true })).toBeVisible();
  });

  test("corrects a device clock thirty seconds ahead using server time", async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + 30_000) });
    await openGame(page);
    await placePrediction(page, "UP");

    await expect(page.getByText(/\b(?:59|60)\s*(?:seconds?|s)\b/i)).toBeVisible();
  });

  test("shows UP winning one cent above entry and live status unavailable when stale", async ({
    page,
  }) => {
    await page.clock.install();
    await openGame(page);
    await placePrediction(page, "UP");
    await expect(page.getByText(/UP/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await market.setPrice("67500.01");
    await expect(page.getByText("WINNING", { exact: true })).toBeVisible();

    await market.update({ silent: true });
    await page.clock.fastForward(10_100);
    await expect(
      page.getByText(/live status.*unavailable|status unavailable|unavailable/i),
    ).toBeVisible();
    await expect(page.getByText("WINNING", { exact: true })).toHaveCount(0);
  });

  test("disables both prediction controls while an authoritative price request is in flight", async ({
    page,
  }) => {
    const before = (await market.update({ restDelayMs: 5_000 })).restRequests;
    await openGame(page);
    await upButton(page).click();

    await expect(upButton(page)).toBeDisabled();
    await expect(downButton(page)).toBeDisabled();
    const duringRequest = await market.update({});
    expect(duringRequest.restRequests - before).toBe(1);
  });

  test("re-syncs an active prediction after a conflict from a second tab", async ({
    page,
    context,
  }) => {
    await openGame(page);
    const secondTab = await context.newPage();
    await openGame(secondTab);
    await expect(upButton(page)).toBeEnabled();
    await expect(downButton(secondTab)).toBeEnabled();

    await placePrediction(page, "UP");
    await expect(page.getByText(/UP/i)).toBeVisible();
    await placePrediction(secondTab, "DOWN");

    await expect(secondTab.getByText(/UP/i)).toBeVisible();
    await expect(secondTab.getByText("$67,500.00", { exact: true })).toBeVisible();
  });

  test("shows a retryable creation error and succeeds after the provider recovers", async ({
    page,
  }) => {
    await market.update({ restFailure: "error" });
    await openGame(page);
    await upButton(page).click();

    await expect(
      page.getByText(/could not.*start|unable.*prediction|try again|retry/i),
    ).toBeVisible();
    await expect(upButton(page)).toBeEnabled();
    await expect(page.getByText("Resolving…", { exact: true })).toHaveCount(0);

    await market.update({ restFailure: "none" });
    await upButton(page).click();
    await expect(page.getByText(/UP/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
  });

  test("completes a prediction while the page is closed, restores the win and refreshes statistics and leaderboards", async ({
    page,
    context,
  }) => {
    await openGame(page);
    await placePrediction(page, "UP");
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
    await market.setPrice("67540.00");

    await page.close();
    await new Promise((resolve) => setTimeout(resolve, 65_000));

    const returnedPage = await context.newPage();
    await openGame(returnedPage);
    await expect(returnedPage.getByText("WIN", { exact: true })).toBeVisible();
    await expect(returnedPage.getByText("$67,500.00 → $67,540.00", { exact: true })).toBeVisible();
    await expect(returnedPage.getByText("+1", { exact: true })).toBeVisible();
    await expect(returnedPage.getByText(/Score:\s*0\s*→\s*1/)).toBeVisible();
    await expect(returnedPage.getByText(/games played\s*:?\s*1/i)).toBeVisible();
    await expect(returnedPage.getByText(/wins\s*:?\s*1/i)).toBeVisible();
    const scoreLeaderboard = returnedPage.getByRole("region", { name: "Score leaderboard" });
    await expect(scoreLeaderboard.getByText("You", { exact: true })).toHaveCount(1);
    await expect(scoreLeaderboard.getByText("You", { exact: true })).toBeVisible();
    const predictorLeaderboard = returnedPage.getByRole("region", {
      name: "Predictor leaderboard",
    });
    await expect(predictorLeaderboard.getByText("You", { exact: true })).toHaveCount(1);
    await expect(predictorLeaderboard.getByText("You", { exact: true })).toBeVisible();
    await expect(returnedPage.locator('[aria-live="polite"]')).toContainText(/WIN/i);
  });
});

test.describe("leaderboards", () => {
  test("shows empty states when nobody has a settled prediction", async ({ page }) => {
    await openGame(page);

    await expect(page.getByText(/no one is ranked yet/i).first()).toBeVisible();
    await expect(
      page.getByText(/complete a prediction.*leaderboard|prediction.*put you on the leaderboard/i),
    ).toBeVisible();
  });

  test("shows a retryable leaderboard error without blocking gameplay", async ({ page }) => {
    await page.route("**/api/leaderboards", (route) => route.abort());
    await openGame(page);

    await expect(
      page.getByText(/leaderboard.*(error|unavailable|failed)|could not.*leaderboard/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /retry|try again/i }).first()).toBeVisible();
    await expect(upButton(page)).toBeEnabled();
    await expect(downButton(page)).toBeEnabled();
  });
});

test.describe("accessible responsive UI", () => {
  test("has no horizontal scrolling at mobile, tablet or desktop widths", async ({ page }) => {
    await openGame(page);

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(upButton(page)).toBeVisible();
      await expect(downButton(page)).toBeVisible();
      await expect(page.getByRole("figure")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("places UP using only the keyboard", async ({ page }) => {
    await openGame(page);
    const button = upButton(page);

    for (let tab = 0; tab < 30; tab++) {
      await page.keyboard.press("Tab");
      if (await button.evaluate((element) => element === document.activeElement)) break;
    }

    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/UP/i)).toBeVisible();
    await expect(page.getByText("$67,500.00", { exact: true })).toBeVisible();
  });

  test("has no automated color-contrast violations in the game controls", async ({ page }) => {
    await openGame(page);
    await expect(upButton(page)).toBeVisible();
    await expect(downButton(page)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations.filter((violation) => violation.id === "color-contrast")).toEqual([]);
  });

  test("announces prediction placement politely without announcing price ticks or countdowns", async ({
    page,
  }) => {
    await page.clock.install();
    await openGame(page);
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion.first()).toHaveAttribute("aria-live", "polite");

    await placePrediction(page, "UP");
    await expect(liveRegion.first()).toContainText(/UP.*67,500\.00|67,500\.00.*UP/i);
    const announcement = await liveRegion.first().textContent();

    await market.setPrice("67501.00");
    await market.setPrice("67499.00");
    await market.setPrice("67500.00");
    await page.clock.fastForward(5_000);
    await expect(liveRegion.first()).toHaveText(announcement ?? "");
  });
});
