import { expect, test, type Page } from "@playwright/test";

const techBoardRoutes = [
  ["Dashboard", "./techboard", /Dashboard/],
  ["Recursos", "./techboard/resources", /Recursos/],
  ["Projetos", "./techboard/projects", /Projetos/],
  ["Ausências", "./techboard/absences", /Férias e Ausências/],
  ["Planner", "./techboard/planner", /Planner de Alocação/],
  ["Organograma", "./techboard/org-chart", /Organograma/],
] as const;

function monitorUnexpectedErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 500) {
      errors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return errors;
}

for (const [name, route, heading] of techBoardRoutes) {
  test(`${name}: rota canônica abre sem erro`, async ({ page }) => {
    const errors = monitorUnexpectedErrors(page);
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error|Something went wrong/i);
    expect(errors).toEqual([]);
  });
}

test("rotas legadas do TechBoard preservam o destino canônico", async ({ page }) => {
  const redirects = [
    ["./dashboard", "/techboard"],
    ["./resources", "/techboard/resources"],
    ["./projects", "/techboard/projects"],
    ["./absences", "/techboard/absences"],
    ["./planner", "/techboard/planner"],
    ["./org-chart", "/techboard/org-chart"],
  ] as const;

  for (const [legacyRoute, canonicalPath] of redirects) {
    await page.goto(legacyRoute);
    await expect(page).toHaveURL(new RegExp(`${canonicalPath.replaceAll("/", "\\/")}$`));
  }
});

test.describe.serial("Recursos: ciclo CRUD", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const originalName = `Recurso E2E ${suffix}`;
  const updatedName = `${originalName} Editado`;

  test("cria, persiste após recarga, edita, pesquisa e exclui", async ({ page }) => {
    await page.goto("./techboard/resources");
    await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();

    await page.getByRole("button", { name: "Novo", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "Novo Recurso" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByPlaceholder("Nome do recurso").fill(originalName);
    await createDialog.getByPlaceholder("email@empresa.com").fill(`e2e-${suffix}@example.test`);
    await createDialog.getByPlaceholder("Ex.: Supply Chain, Finance, Diretoria...").fill("Qualidade E2E");
    await createDialog.getByRole("button", { name: "Criar", exact: true }).click();

    await expect(page.getByText(originalName, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(originalName, { exact: true })).toBeVisible();

    const createdRow = page.getByRole("row").filter({ hasText: originalName });
    await createdRow.getByRole("button").nth(0).click();
    const editDialog = page.getByRole("dialog", { name: "Editar Recurso" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByPlaceholder("Nome do recurso").fill(updatedName);
    await editDialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible();

    const search = page.getByPlaceholder("Buscar por nome, e-mail, frente ou perfil...");
    await search.fill(updatedName);
    await expect(page.getByRole("row").filter({ hasText: updatedName })).toBeVisible();
    await search.fill(`inexistente-${suffix}`);
    await expect(page.getByText("Nenhum recurso encontrado")).toBeVisible();
    await search.fill(updatedName);

    page.once("dialog", dialog => dialog.accept());
    const updatedRow = page.getByRole("row").filter({ hasText: updatedName });
    await updatedRow.getByRole("button").nth(1).click();
    await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
  });
});

