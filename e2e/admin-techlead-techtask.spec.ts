import { expect, test, type Locator, type Page } from "@playwright/test";

const runId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const routes = [
  { path: "techlead", heading: "Controle da jornada" },
  { path: "techlead/gp-track", heading: "Trilha do Projeto" },
  { path: "techlead/teams", heading: "Equipes do projeto" },
  { path: "techlead/indicators", heading: "Controle da jornada" },
  { path: "techtask", heading: "Controle da jornada" },
  { path: "techtask/board", heading: "Atividades" },
  { path: "techtask/my-work", heading: "Meu trabalho" },
  { path: "admin", heading: "Administração" },
  { path: "admin/users", heading: "Gestão de Acesso" },
  { path: "admin/registrations", heading: "Cadastros" },
  { path: "admin/standards", heading: "Configurações do TechMove" },
] as const;

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 500) {
      failures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });
  return failures;
}

async function expectNoViewportClipping(page: Page) {
  const documentWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client + 2);
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
      )
        return [];

      let ancestor: HTMLElement | null = node;
      let intentionallyScrollable = false;
      while (ancestor && ancestor !== document.body) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (
          ancestorStyle.overflowX === "auto" ||
          ancestorStyle.overflowX === "scroll"
        ) {
          intentionallyScrollable = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      const clipsRight = rect.right > viewportWidth + 2;
      if (!clipsRight || intentionallyScrollable) return [];

      return [
        {
          tag: node.tagName.toLowerCase(),
          text: (node.textContent || "").trim().slice(0, 70),
          right: Math.round(rect.right),
          viewportWidth,
        },
      ];
    });
  });
  expect(
    offenders.slice(0, 5),
    JSON.stringify(offenders.slice(0, 5), null, 2)
  ).toEqual([]);
}

async function fillByLabelOrFirst(
  dialog: Locator,
  label: RegExp,
  fallback: string,
  value: string
) {
  const labelled = dialog.getByLabel(label);
  if (await labelled.count()) await labelled.first().fill(value);
  else await dialog.locator(fallback).first().fill(value);
}

test.describe("TechLead, TechTask e Admin — rotas e layout", () => {
  for (const route of routes) {
    test(`${route.path} carrega sem falhas e sem corte horizontal`, async ({
      page,
    }) => {
      const failures = collectRuntimeFailures(page);
      await page.goto(`./${route.path}`);
      await expect(page.locator("#root")).toBeVisible();
      await expect(
        page.getByText(route.heading, { exact: false }).first()
      ).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        /Application error|Something went wrong/i
      );
      await expectNoViewportClipping(page);
      expect(failures).toEqual([]);
    });
  }
});

test("menus alternam entre TechMove, TechBoard e Administração e preservam deep links", async ({
  page,
  isMobile,
}) => {
  await page.goto("./techlead/teams");
  if (isMobile) {
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    if (await toggle.isVisible()) await toggle.click();
  }

  await page.getByRole("button", { name: "TechBoard" }).click();
  await expect(page.getByRole("button", { name: "Kanban" })).toBeVisible();
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page).toHaveURL(/\/techboard\/kanban$/);

  if (isMobile) {
    const toggle = page.getByRole("button", { name: /toggle sidebar/i });
    if (await toggle.isVisible()) await toggle.click();
  }
  const administration = page.getByRole("button", { name: "Administração" });
  await expect(administration).toBeVisible();
  await administration.click({ force: isMobile });
  await expect(
    page.getByRole("button", { name: "Cadastros gerais" })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cadastros gerais" })
    .click({ force: isMobile });
  await expect(page).toHaveURL(/\/admin\/registrations$/);
});

test("Admin Cadastros permite criar, editar, recarregar e excluir com confirmação", async ({
  page,
}, testInfo) => {
  const original = `Perfil ${runId}-${testInfo.project.name}`;
  const edited = `${original} editado`;
  await page.goto("./admin/registrations");
  await expect(page.getByRole("heading", { name: "Cadastros" })).toBeVisible();

  const input = page.getByPlaceholder(/Novo perfi/i);
  await input.fill(original);
  await page.getByRole("button", { name: /Adicionar/i }).click();
  await expect(page.getByText(original, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Editar ${original}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Editar Item")).toBeVisible();
  await fillByLabelOrFirst(dialog, /Valor/i, "input", edited);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  page.once("dialog", confirmation => confirmation.dismiss());
  await page.getByRole("button", { name: `Excluir ${edited}` }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  page.once("dialog", confirmation => confirmation.accept());
  await page.getByRole("button", { name: `Excluir ${edited}` }).click();
  await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
});

test("TechTask valida criação e permite criar atividade interna persistente", async ({
  page,
}, testInfo) => {
  const title = `Atividade ${runId}-${testInfo.project.name}`;
  await page.goto("./techboard/kanban");
  await page.getByRole("button", { name: "Nova atividade" }).click();
  const dialog = page.getByRole("dialog");
  const create = dialog.getByRole("button", { name: "Criar", exact: true });
  await expect(create).toBeDisabled();

  await dialog.getByText("Projeto", { exact: true }).first().click();
  await page.getByRole("option", { name: "Operação interna" }).click();
  await fillByLabelOrFirst(dialog, /Título/i, "input:not([type=date])", title);
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
    title
  );
  await expect(page).toHaveURL(/activityId=/);

  await page.reload();
  const details = page.getByRole("dialog");
  await expect(details.locator("input").first()).toHaveValue(title);
  const remove = details.getByRole("button", { name: /Arquivar item/i });
  if (await remove.isVisible()) {
    await remove.click();
    const archiveDialog = page.getByRole("dialog", {
      name: /Arquivar item e entregável/i,
    });
    await archiveDialog
      .getByRole("textbox")
      .fill("Limpeza do teste automatizado");
    await archiveDialog
      .getByRole("button", { name: "Arquivar", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("rotas legadas de TechLead, TechTask e Admin redirecionam corretamente", async ({
  page,
}) => {
  const redirects = [
    ["gp-checklist", /\/techmove\/trail$/],
    ["activities", /\/techboard\/kanban$/],
    ["access", /\/admin\/users$/],
    ["cadastros", /\/admin\/registrations$/],
  ] as const;
  for (const [from, destination] of redirects) {
    await page.goto(`./${from}`);
    await expect(page).toHaveURL(destination);
  }
});
