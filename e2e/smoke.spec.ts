import { expect, test } from "@playwright/test";

test("carrega a aplicação", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#root")).toBeVisible();
  await expect(page).toHaveTitle(/TechBoard|Delivery|Resource/i);
});
