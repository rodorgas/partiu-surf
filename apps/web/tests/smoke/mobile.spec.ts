import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["iPhone 13"] });

test("mobile boot renders summary card + sheet at peek", async ({ page }) => {
  await page.goto("/");
  // Spot summary visible.
  await expect(page.getByText("Itamambuca").first()).toBeVisible();
  const sheet = page.getByTestId("mobile-sheet");
  await expect(sheet).toHaveAttribute("data-state", "peek");
});

test("sheet cycle: peek -> half -> full -> peek via grabber click", async ({ page }) => {
  await page.goto("/");
  const sheet = page.getByTestId("mobile-sheet");
  const grabber = page.getByTestId("sheet-grabber");

  await expect(sheet).toHaveAttribute("data-state", "peek");
  await grabber.click();
  await expect(sheet).toHaveAttribute("data-state", "half");
  await grabber.click();
  await expect(sheet).toHaveAttribute("data-state", "full");
  await expect(page.getByTestId("mobile-dim")).toBeVisible();
  // The "×" close button is rendered only in full.
  await page.getByRole("button", { name: "fechar" }).click();
  await expect(sheet).toHaveAttribute("data-state", "peek");
});
