import { expect, test } from "@playwright/test";

test("describes the default chart window as the last 2 minutes", async ({ page }) => {
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

  const chart = page.getByRole("figure");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("aria-label", /last 2 minutes/i);
});
