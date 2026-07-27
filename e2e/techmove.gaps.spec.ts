import { expect, test } from "@playwright/test";
import {
  hasPostgres,
  selectRadixOption,
  techMoveUrl,
} from "./helpers/techmove";

test.describe("Gaps CRUD e movimentação", () => {
  test.skip(
    !hasPostgres,
    "CRUD TechMove requer DATABASE_URL: o fallback local não persiste entidades workflow."
  );
  test.describe.configure({ mode: "serial" });

  test("cria, consulta, edita, arrasta e exclui um gap", async ({ page }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const initialDescription = `Gap E2E ${suffix}`;
    const editedDescription = `${initialDescription} editado`;

    await page.goto(techMoveUrl("/techmove/gaps"));
    await page.getByRole("button", { name: "Novo Gap" }).click();
    const dialog = page.getByRole("dialog", { name: "Novo Gap" });
    await expect(dialog).toBeVisible();

    await dialog
      .getByPlaceholder(/Descreva a necessidade não atendida/i)
      .fill(initialDescription);
    await dialog.getByRole("button", { name: "MM", exact: true }).click();
    await dialog.getByRole("button", { name: "ABAP", exact: true }).click();
    await selectRadixOption(page, "Impacto", "Alto");
    await selectRadixOption(page, "Responsável", "Pedro Silva");
    await dialog.getByLabel("Esforço ABAP (horas)").fill("13");
    await dialog.getByLabel("Esforço técnico (horas)").fill("8");
    await dialog
      .getByPlaceholder(/Registre a solução proposta/i)
      .fill("Implementar extensão validada pelo arquiteto.");
    await expect(dialog).toContainText("21 horas");
    await dialog.getByRole("button", { name: /Criar Gap|Salvar/i }).click();

    await expect(page.getByText("Gap criado")).toBeVisible();
    await expect(page.getByText(initialDescription, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText(initialDescription, { exact: true })).toBeVisible();
    await page.getByText(initialDescription, { exact: true }).click();

    const editDialog = page.getByRole("dialog", { name: "Detalhes do Gap" });
    await editDialog
      .getByPlaceholder(/Descreva a necessidade não atendida/i)
      .fill(editedDescription);
    await selectRadixOption(page, "Status", "Em análise");
    await editDialog.getByRole("button", { name: /Salvar/i }).click();
    await expect(page.getByText("Gap atualizado")).toBeVisible();

    await page.getByRole("button", { name: "Tabela" }).click();
    await page
      .getByPlaceholder(/Buscar por descrição, módulo ou responsável/i)
      .fill(suffix);
    const row = page.getByRole("row").filter({ hasText: editedDescription });
    await expect(row).toContainText("MM");
    await expect(row).toContainText("ABAP");
    await expect(row).toContainText("Pedro Silva");
    await expect(row).toContainText("21h");
    await expect(row).toContainText("Em análise");

    await page.getByRole("button", { name: "Kanban" }).click();
    const card = page.getByText(editedDescription, { exact: true }).locator("..");
    const target = page
      .getByRole("heading", { name: "Resolvido", exact: true })
      .locator("../..");
    await card.getByRole("button", { name: "Arrastar gap" }).dragTo(target);
    await expect(page.getByText("Gap atualizado")).toBeVisible();

    await page.reload();
    const resolvedColumn = page
      .getByRole("heading", { name: "Resolvido", exact: true })
      .locator("../..");
    await expect(resolvedColumn).toContainText(editedDescription);

    await page.getByText(editedDescription, { exact: true }).click();
    await page
      .getByRole("dialog", { name: "Detalhes do Gap" })
      .getByRole("button", { name: /Excluir/i })
      .click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Excluir este gap?");
    await confirmation.getByRole("button", { name: /Cancelar/i }).click();
    await expect(page.getByRole("dialog", { name: "Detalhes do Gap" })).toBeVisible();

    await page
      .getByRole("dialog", { name: "Detalhes do Gap" })
      .getByRole("button", { name: /Excluir/i })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Excluir|Confirmar/i })
      .click();
    await expect(page.getByText("Gap removido")).toBeVisible();
    await expect(page.getByText(editedDescription, { exact: true })).toHaveCount(0);
  });

  test("seleção em tabela permite atualização em lote", async ({ page }) => {
    await page.goto(techMoveUrl("/techmove/gaps"));
    await page.getByRole("button", { name: "Tabela" }).click();

    const rows = page.getByRole("row").filter({ has: page.getByRole("checkbox") });
    test.skip((await rows.count()) < 2, "O projeto precisa ter ao menos dois gaps para o lote.");

    await rows.nth(0).getByRole("checkbox").click();
    await rows.nth(1).getByRole("checkbox").click();
    await selectRadixOption(page, "Novo status", "Aceito");
    await page.getByRole("button", { name: "Aplicar em lote" }).click();
    await expect(page.getByText(/2 gaps atualizados/)).toBeVisible();
  });
});

test("anexo acima de 10 MB é recusado no cliente", async ({ page }) => {
  await page.goto(techMoveUrl("/techmove/gaps"));
  await page.getByRole("button", { name: "Novo Gap" }).click();

  const input = page.getByRole("dialog").locator('input[type="file"]');
  await input.setInputFiles({
    name: "grande.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByText("O anexo deve ter no máximo 10 MB")).toBeVisible();
});

