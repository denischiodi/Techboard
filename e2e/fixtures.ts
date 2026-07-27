import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

const ignoredConsolePatterns = [
  /favicon/i,
  /baseline-browser-mapping/i,
  /oauth_server_url is not configured/i,
  /missing session cookie/i,
];

function ignored(message: string) {
  return ignoredConsolePatterns.some(pattern => pattern.test(message));
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, provide, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && !ignored(message.text()))
        consoleErrors.push(message.text());
    });
    page.on("response", response => {
      const url = response.url();
      if (response.status() >= 500 && url.includes("/api/"))
        serverErrors.push(`${response.status()} ${url}`);
    });

    await provide(page);

    if (pageErrors.length || consoleErrors.length || serverErrors.length) {
      await attachDiagnostics(testInfo, { pageErrors, consoleErrors, serverErrors });
    }
    expect(pageErrors, "erros JavaScript não tratados").toEqual([]);
    expect(consoleErrors, "erros inesperados no console").toEqual([]);
    expect(serverErrors, "respostas inesperadas 5xx").toEqual([]);
  },
});

async function attachDiagnostics(
  testInfo: TestInfo,
  diagnostics: Record<string, string[]>,
) {
  await testInfo.attach("browser-diagnostics.json", {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: "application/json",
  });
}

export { expect };

export async function expectNoClippedContent(page: Page) {
  const offenders = await page.locator("body").evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter(element => {
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.position === "absolute") return false;
        if (["auto", "scroll"].includes(style.overflowX)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > viewportWidth + 2 && rect.left < viewportWidth;
      })
      .slice(0, 20)
      .map(element => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || "").trim().slice(0, 80),
        className: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        viewportWidth,
      }));
  });
  expect(offenders, "elementos cortados sem rolagem horizontal").toEqual([]);
}

export async function expectReachableHorizontalEnd(locator: ReturnType<Page["locator"]>) {
  const result = await locator.evaluate(element => {
    const node = element as HTMLElement;
    if (node.scrollWidth <= node.clientWidth) return true;
    const original = node.scrollLeft;
    node.scrollLeft = node.scrollWidth;
    const reached = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    node.scrollLeft = original;
    return reached;
  });
  expect(result, "o final da área horizontal deve ser alcançável").toBe(true);
}
