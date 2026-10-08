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

function instructionsDialog(page: Page) {
  return page.getByRole("dialog", { name: "How to play" });
}

function dontShowAgain(page: Page) {
  return instructionsDialog(page).getByRole("checkbox", { name: "Don't show again" });
}

function gotItButton(page: Page) {
  return instructionsDialog(page).getByRole("button", { name: "Got it" });
}

function gamePlayerName(page: Page) {
  return page.getByText(/Player-\d{4}/).first();
}

async function openGame(page: Page) {
  await page.goto("/");
  await expect(gamePlayerName(page)).toBeAttached();
}

test("opens the instructions over the game on a first visit", async ({ page }) => {
  await openGame(page);

  await expect(instructionsDialog(page)).toBeVisible();
  await expect(gamePlayerName(page)).toBeAttached();
  await expect(dontShowAgain(page)).not.toBeChecked();
});

test("shows the instructions again after closing without opting out and reloading", async ({
  page,
}) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();
  await expect(dontShowAgain(page)).not.toBeChecked();
  await gotItButton(page).click();
  await expect(instructionsDialog(page)).toBeHidden();

  await page.reload();
  await expect(gamePlayerName(page)).toBeAttached();
  await expect(instructionsDialog(page)).toBeVisible();
});

test("remembers opting out after reload and in another tab in the same browser", async ({
  page,
  context,
}) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();
  await dontShowAgain(page).check();
  await gotItButton(page).click();
  await expect(instructionsDialog(page)).toBeHidden();

  await page.reload();
  await expect(gamePlayerName(page)).toBeAttached();
  await expect(instructionsDialog(page)).toBeHidden();

  const secondTab = await context.newPage();
  await openGame(secondTab);
  await expect(instructionsDialog(secondTab)).toBeHidden();
  await expect(secondTab.getByRole("button", { name: "How to play" })).toBeVisible();
});

test("restores the saved checkbox choice and lets the player opt back in", async ({ page }) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();
  await dontShowAgain(page).check();
  await gotItButton(page).click();

  await page.getByRole("button", { name: "How to play" }).click();
  await expect(instructionsDialog(page)).toBeVisible();
  await expect(dontShowAgain(page)).toBeChecked();
  await dontShowAgain(page).uncheck();
  await gotItButton(page).click();

  await page.reload();
  await expect(gamePlayerName(page)).toBeAttached();
  await expect(instructionsDialog(page)).toBeVisible();
  await expect(dontShowAgain(page)).not.toBeChecked();
});

test("explains the round, scoring, leaderboards, and the default one-minute window", async ({
  page,
}) => {
  await openGame(page);
  const dialog = instructionsDialog(page);
  await expect(dialog).toBeVisible();

  await expect(dialog).toContainText(/BTC\/USD/i);
  await expect(dialog).toContainText(/higher.*UP|UP.*higher/i);
  await expect(dialog).toContainText(/lower.*DOWN|DOWN.*lower/i);
  await expect(dialog).toContainText(/after the prediction window|after the window/i);
  await expect(dialog).toContainText(/entry price/i);
  await expect(dialog).toContainText(
    /server.{0,100}(?:price|prediction)|(?:price|prediction).{0,100}server/i,
  );
  await expect(dialog).toContainText(/only one.*prediction.*active|one active prediction/i);
  await expect(dialog).toContainText(/first.*price.*differ.*entry price/i);
  await expect(dialog).toContainText(/\+1/);
  await expect(dialog).toContainText(/(?:incorrect|wrong).*(?:−|-)1/i);
  await expect(dialog).toContainText(/WINNING.*LOSING|LOSING.*WINNING/i);
  await expect(dialog).toContainText(/guide/i);
  await expect(dialog).toContainText(/server.*result|result.*server/i);
  await expect(dialog).toContainText(/page.*closed|close.*page/i);
  await expect(dialog).toContainText(/progress.*browser|browser.*progress/i);
  await expect(dialog).toContainText(
    /score.{0,60}(?:leaderboard|board)|(?:leaderboard|board).{0,60}score/i,
  );
  await expect(dialog).toContainText(/adjusted accuracy/i);
  await expect(dialog).toContainText(/longer.{0,40}record|few lucky|lucky guesses/i);
  await expect(dialog).toContainText(/1 minute/i);
});

test("keeps keyboard focus in the dialog and returns it to How to play on Escape", async ({
  page,
}) => {
  await openGame(page);
  const dialog = instructionsDialog(page);
  await expect(dialog).toBeVisible();

  for (let tab = 0; tab < 6; tab++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "How to play" })).toBeFocused();
});

test("closes with Got it and returns focus to How to play", async ({ page }) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();

  await gotItButton(page).click();

  await expect(instructionsDialog(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "How to play" })).toBeFocused();
});

test("does not place a prediction when UP is clicked behind the open dialog", async ({ page }) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();

  const upButtonBehindDialog = page.locator("button").filter({ hasText: /\bUP\b|higher/i });
  await expect(upButtonBehindDialog).toHaveCount(1);
  const predictionRequest = page
    .waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === "/api/me/predictions",
      { timeout: 500 },
    )
    .catch(() => null);
  await upButtonBehindDialog.click({ force: true });
  expect(await predictionRequest).toBeNull();

  await gotItButton(page).click();
  await expect(page.getByText(/Your prediction:/i)).toHaveCount(0);
});

test("keeps the same prediction pending and its countdown running while instructions are open", async ({
  page,
}) => {
  await page.clock.install();
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();
  await gotItButton(page).click();

  await page.getByRole("button", { name: /\bUP\b|higher/i }).click();
  await expect(page.getByText(/Your prediction:\s*UP/i)).toBeVisible();
  await page.clock.fastForward(20_000);
  const countdown = page.getByText(/Time left:/i);
  await expect(countdown).toContainText(/(?:38|39|40|41)\s*(?:seconds?|s)/i);

  await page.getByRole("button", { name: "How to play" }).click();
  await expect(instructionsDialog(page)).toBeVisible();
  await page.clock.fastForward(10_000);
  await gotItButton(page).click();

  await expect(page.getByText(/Your prediction:\s*UP/i)).toBeVisible();
  await expect(page.getByText("$67,500.00", { exact: true }).first()).toBeVisible();
  await expect(countdown).toContainText(/(?:27|28|29|30|31)\s*(?:seconds?|s)/i);
});

test("keeps the dialog reachable without horizontal page scrolling at 375 pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();

  await expect(dontShowAgain(page)).toBeVisible();
  await expect(gotItButton(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await dontShowAgain(page).check();
  await gotItButton(page).click();
  await expect(instructionsDialog(page)).toBeHidden();
});

test("has no axe violations while the instructions dialog is open", async ({ page }) => {
  await openGame(page);
  await expect(instructionsDialog(page)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
