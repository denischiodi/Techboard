import { expect, test, type Locator, type Page } from "@playwright/test";

const runId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const routes = [
  { path: "techlead", heading: "TechLead" },
  { path: "techlead/gp-track", heading: "GP Track" },
  { path: "techlead/teams", heading: "Times e frentes" },
  { path: "techlead/indicators", heading: "Indicadores de governança" },
  { path: "techtask", heading: "TechTask" },
  { path: "techtask/board", heading: "Atividades" },
  { path: "techtask/my-work", heading: "Meu trabalho" },
  { path: "admin", heading: "Admin" },
  { path: "admin/users", heading: "Gestão de Acesso" },
  { path: "admin/registrations", heading: "Cadastros" },
  { path: "admin/standards", heading: "Configurações Padrão" },
] as const;

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

async function expectNoViewportClipping(page: Page) {
  const offenders = await page.locator("body *").evaluateAll(elements => {
    const viewportWidth = document.documentElement.clientWidth;
    return elements.flatMap(element => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (
        !rect.width ||
        !rect.height ||
        style.position === "fixed" ||
        style.position === "absolute" ||
        node.closest('[role="dialog"]') ||
        node.closest("[data-radix-popper-content-wrapper]")
      ) return [];

      const parent = node.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const intentionallyScrollable =
        style.overflowX === "auto" ||
        style.overflowX === "scroll" ||
        parentStyle?.overflowX === "auto" ||
        parentStyle?.overflowX === "scroll";
      const clipsRight = rect.right > viewportWidth + 2;
      if (!clipsRight || intentionallyScrollable) return [];

      return [{
        tag: node.tagName.toLowerCase(),
        text: (node.textContent || "").trim().slice(0, 70),
        right: Math.round(rect.right),
        viewportWidth,
      }];
    });
  });
  expect(offenders.slice(0, 5), JSON.stringify(offenders.slice(0, 5), null, 2)).toEqual([]);
}

async function fillByLabelOrFirst(dialog: Locator, label: RegExp, fallback: string, value: string) {
  const labelled = dialog.getByLabel(label);
  if (await labelled.count()) await labelled.first().fill(value);
  else await dialog.locator(fallback).first().fill(value);
}

test.describe("TechLead, TechTask e Admin — rotas e layout", () => {
  for (const route of routes) {
    test(`${route.path} carrega sem falhas e sem corte horizontal`, async ({ page }) => {
      const failures = collectRuntimeFailures(page);
      await page.goto(`./${route.path}`);
      await expect(page.locator("#root")).toBeVisible();
      await expect(page.getByText(route.heading, { exact: false }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Application error|Something went wrong/i);
      await expectNoViewportClipping(page);
      expect(failures).toEqual([]);
    });
  }
});

test("menus alternam entre TechLead, TechTask e Admin e preservam deep links", async ({ page, isMobile }) => {
  await page.goto("./techlead/teams");
  if (isMobile) {
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    if (await toggle.isVisible()) await toggle.click();
  }

  await page.getByRole("button", { name: "TechTask" }).click();
  await expect(page.getByRole("button", { name: "Quadro de atividades" })).toBeVisible();
  await page.getByRole("button", { name: "Quadro de atividades" }).click();
  await expect(page).toHaveURL(/\/techtask\/board$/);

  if (isMobile) {
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    if (await toggle.isVisible()) await toggle.click();
  }
  await page.getByRole("button", { name: "Admin" }).click();
  await expect(page.getByRole("button", { name: "Cadastros" })).toBeVisible();
  await page.getByRole("button", { name: "Cadastros" }).click();
  await expect(page).toHaveURL(/\/admin\/registrations$/);
});

test("Admin Cadastros permite criar, editar, recarregar e excluir com confirmação", async ({ page }) => {
  const original = `Perfil ${runId}`;
  const edited = `${original} editado`;
  await page.goto("./admin/registrations");
  await expect(page.getByRole("heading", { name: "Cadastros" })).toBeVisible();

  const input = page.getByPlaceholder(/Novo perfi/i);
  await input.fill(original);
  await page.getByRole("button", { name: /Adicionar/i }).click();
  await expect(page.getByText(original, { exact: true })).toBeVisible();

  const row = page.getByText(original, { exact: true }).locator("..");
  await row.getByRole("button").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Editar Item")).toBeVisible();
  await fillByLabelOrFirst(dialog, /Valor/i, "input", edited);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  page.once("dialog", confirmation => confirmation.dismiss());
  await page.getByText(edited, { exact: true }).locator("..").getByRole("button").last().click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  page.once("dialog", confirmation => confirmation.accept());
  await page.getByText(edited, { exact: true }).locator("..").getByRole("button").last().click();
  await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
});

test("TechTask valida criação e permite criar atividade interna persistente", async ({ page }) => {
  const title = `Atividade ${runId}`;
  await page.goto("./techtask/board");
  await page.getByRole("button", { name: "Nova atividade" }).click();
  const dialog = page.getByRole("dialog");
  const create = dialog.getByRole("button", { name: "Criar", exact: true });
  await expect(create).toBeDisabled();

  await dialog.getByText("Projeto", { exact: true }).first().click();
  await page.getByRole("option", { name: "Operação interna" }).click();
  await fillByLabelOrFirst(dialog, /Título/i, "input:not([type=date])", title);
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByText(title, { exact: true }).click();
  const details = page.getByRole("dialog");
  const remove = details.getByRole("button", { name: /Excluir card/i });
  if (await remove.isVisible()) {
    page.once("dialog", confirmation => confirmation.accept());
    await remove.click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  }
});

test("rotas legadas de TechLead, TechTask e Admin redirecionam corretamente", async ({ page }) => {
  const redirects = [
    ["gp-checklist", /\/techlead\/gp-track$/],
    ["activities", /\/techtask\/board$/],
    ["access", /\/admin\/users$/],
    ["cadastros", /\/admin\/registrations$/],
  ] as const;
  for (const [from, destination] of redirects) {
    await page.goto(`./${from}`);
    await expect(page).toHaveURL(destination);
  }
});
