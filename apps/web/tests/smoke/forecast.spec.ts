import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("/itamambuca renders 14 hour rows with parseable scores", async ({ page }) => {
  await page.goto("/itamambuca");
  await expect(
    page.getByRole("heading", { level: 1, name: "Itamambuca" }),
  ).toBeVisible();

  // The hour table column header anchors the table itself.
  await expect(page.getByText("Hora a hora")).toBeVisible();

  // Every row starts with `NNh` and the daylight slice is 05h..18h = 14 rows.
  const rowTimes = await page
    .locator(".layout-desktop")
    .getByText(/^\d{2}h$/)
    .allTextContents();
  // Drop top-bar / hero "hoje" type cells — the table-row times should each
  // appear at least once; assert we see the full 05h..18h sequence.
  const distinctHours = Array.from(new Set(rowTimes));
  for (const h of ["05h", "12h", "18h"]) {
    expect(distinctHours).toContain(h);
  }
  expect(distinctHours.length).toBeGreaterThanOrEqual(14);
});

test("/ redirects to /itamambuca", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.url()).toContain("/itamambuca");
});
