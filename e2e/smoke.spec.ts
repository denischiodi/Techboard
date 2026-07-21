import { expect, test } from "@playwright/test";

const moduleRoutes = [
  ["launcher", "./"],
  ["TechBoard", "./techboard"],
  ["TechLead", "./techlead"],
  ["TechTask", "./techtask"],
  ["TechMove", "./techmove"],
  ["Admin", "./admin"],
] as const;

for (const [moduleName, route] of moduleRoutes) {
  test(`${moduleName} carrega sem erro de renderização`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(route);
    await expect(page.locator("#root")).toBeVisible();
    await expect(page).toHaveTitle(/TechBoard|Delivery|Resource/i);
    await expect(page.locator("body")).not.toContainText("Application error");
    expect(pageErrors).toEqual([]);
  });
}

test("rotas legadas redirecionam para os módulos consolidados", async ({ page }) => {
  await page.goto("./workflow");
  await expect(page).toHaveURL(/\/techboard\/techmove$/);
  await page.goto("./activities");
  await expect(page).toHaveURL(/\/techboard\/techtask\/board$/);
});
