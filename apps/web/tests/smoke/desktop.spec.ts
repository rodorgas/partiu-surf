import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("desktop boot renders Itamambuca + 8.9 score, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Itamambuca" })).toBeVisible();
  await expect(page.getByText("8.9").first()).toBeVisible();
  expect(errors).toEqual([]);
});
