import { expect, type Page, type TestInfo } from "@playwright/test";

export const TECHMOVE_PROJECT_ID =
  process.env.PLAYWRIGHT_TECHMOVE_PROJECT_ID || "p1";

export const hasPostgres = Boolean(
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL
);

export function techMoveUrl(path: string, projectId = TECHMOVE_PROJECT_ID) {
  const separator = path.includes("?") ? "&" : "?";
  return `.${path}${separator}projectId=${encodeURIComponent(projectId)}`;
}

export function observeUnexpectedErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  return errors;
}

export async function expectHealthyPage(page: Page, errors: string[]) {
  await expect(page.locator("#root")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Application error|Erro inesperado|Internal Server Error/i
  );
  await page.waitForLoadState("networkidle");
  expect(errors, errors.join("\n")).toEqual([]);
}

export async function expectNoUnreachableHorizontalContent(
  page: Page,
  testInfo: TestInfo
) {
  const audit = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const bodyWidth = document.body.scrollWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const clipped: Array<{ tag: string; text: string; right: number }> = [];

    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a, input, textarea, [role='button'], [role='dialog']"
      )
    )) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right <= viewportWidth + 1) continue;

      const scrollParent = (() => {
        let parent = element.parentElement;
        while (parent) {
          const style = getComputedStyle(parent);
          if (
            /(auto|scroll)/.test(style.overflowX) &&
            parent.scrollWidth > parent.clientWidth
          )
            return parent;
          parent = parent.parentElement;
        }
        return null;
      })();

      if (!scrollParent)
        clipped.push({
          tag: element.tagName.toLowerCase(),
          text:
            (element.getAttribute("aria-label") || element.innerText || "")
              .trim()
              .slice(0, 80),
          right: Math.round(rect.right),
        });
    }

    return { viewportWidth, bodyWidth, documentWidth, clipped };
  });

  await testInfo.attach("horizontal-layout-audit", {
    body: JSON.stringify(audit, null, 2),
    contentType: "application/json",
  });

  expect(audit.bodyWidth).toBeLessThanOrEqual(audit.viewportWidth + 1);
  expect(audit.documentWidth).toBeLessThanOrEqual(audit.viewportWidth + 1);
  expect(audit.clipped).toEqual([]);
}

export async function selectRadixOption(
  page: Page,
  label: string,
  option: string
) {
  const field = page.getByText(label, { exact: true }).locator("..");
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
