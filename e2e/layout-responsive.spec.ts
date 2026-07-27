import { expect, test, type Page } from "@playwright/test";

const routes = [
  ["dashboard", "./techboard"],
  ["recursos", "./techboard/resources"],
  ["projetos", "./techboard/projects"],
  ["ausências", "./techboard/absences"],
  ["planner", "./techboard/planner"],
  ["organograma", "./techboard/org-chart"],
] as const;

async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    Math.max(dimensions.documentWidth, dimensions.bodyWidth),
    `A página excede o viewport: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectInteractiveControlsInsideViewport(page: Page) {
  const offenders = await page.locator("button:visible, input:visible, [role=button]:visible").evaluateAll(elements =>
    elements
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
            element.tagName,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
        };
      })
      .filter(item => item.right > window.innerWidth + 1 || item.left < -1)
  );
  expect(offenders, `Controles fora do viewport: ${JSON.stringify(offenders)}`).toEqual([]);
}

for (const [name, route] of routes) {
  test(`${name}: não corta a página nem controles no viewport configurado`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("#root")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoDocumentOverflow(page);
    await expectInteractiveControlsInsideViewport(page);
  });
}

test("diálogo de recurso permanece acessível e rolável em tela pequena", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Cenário específico do projeto Chromium mobile");
  await page.goto("./techboard/resources");
  await page.getByRole("button", { name: "Novo", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Novo Recurso" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
  expect(bounds!.height).toBeLessThanOrEqual((await page.evaluate(() => innerHeight)) + 1);

  await dialog.getByRole("button", { name: "Cancelar" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
});

test("navegação TechBoard por menu funciona em desktop e mobile", async ({ page, isMobile }) => {
  await page.goto("./techboard");
  if (isMobile) {
    await page.getByRole("button", { name: /toggle sidebar/i }).click();
  }
  await page.getByRole("button", { name: "Recursos", exact: true }).click();
  await expect(page).toHaveURL(/\/techboard\/resources$/);
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
});

