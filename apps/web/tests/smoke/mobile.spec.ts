import { expect, test } from "@playwright/test";

// Emulate iPhone 13 dimensions on Chromium (so we don't need a webkit install).
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test("mobile boot renders summary card + sheet at peek", async ({ page }) => {
  await page.goto("/");
  // Scope to the visible mobile layout; desktop is in DOM but display:none.
  const mobileLayout = page.locator(".layout-mobile");
  await expect(mobileLayout.getByText("Itamambuca").first()).toBeVisible();
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
  await page.getByRole("button", { name: "fechar" }).click();
  await expect(sheet).toHaveAttribute("data-state", "peek");
});
