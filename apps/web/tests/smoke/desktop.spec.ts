import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("desktop boot renders Itamambuca with a parseable score, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Itamambuca" })).toBeVisible();

  // Score wedge — must show a number 0..10 in N.N format. The exact value
  // depends on live Open-Meteo data; we just assert it's parseable and in range.
  const wedge = page.locator("svg").filter({ hasText: /^\d+\.\d$/ }).first();
  await expect(wedge).toBeVisible();
  const wedgeText = (await wedge.textContent()) ?? "";
  const match = wedgeText.match(/(\d+\.\d)/);
  expect(match, `score not parseable: ${wedgeText}`).not.toBeNull();
  const score = Number(match![1]);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(10);

  expect(errors).toEqual([]);
});
