import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test("clicking a desktop suggestion fills the chat input", async ({ page }) => {
  await page.goto("/");
  const firstSuggestion = "Tá bom pro shortboard agora?";
  await page.getByRole("button", { name: new RegExp(firstSuggestion.replace(/\?/g, "\\?")) }).click();
  const input = page.getByPlaceholder("pergunta sobre a previsão…");
  await expect(input).toHaveValue(firstSuggestion);
});
