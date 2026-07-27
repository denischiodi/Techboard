import { expect, test } from "@playwright/test";
import {
  expectHealthyPage,
  expectNoUnreachableHorizontalContent,
  observeUnexpectedErrors,
  techMoveUrl,
} from "./helpers/techmove";

const routes = [
  ["/techmove", /TechMove/i],
  ["/techmove/projects", /Projeto|Workflow|TechMove/i],
  ["/techmove/scope-items", /Escopo|Scope/i],
  ["/techmove/bdcq", /BDCQ/i],
  ["/techmove/workshops", /Workshop/i],
  ["/techmove/dcd", /DCD/i],
  ["/techmove/gaps", /^Gaps$/i],
  ["/techmove/configurations", /Configura/i],
  ["/techmove/tests?testType=unit_test", /Teste/i],
  ["/techmove/governance", /Governan/i],
  ["/techmove/raid", /RAID|Risco|Issue/i],
  ["/techmove/trail?stage=cutover", /Cutover|Trilha/i],
] as const;

for (const [path, heading] of routes) {
  test(`${path} abre sem erro, corte ou ação inacessível`, async ({
    page,
  }, testInfo) => {
    const errors = observeUnexpectedErrors(page);
    await page.goto(techMoveUrl(path));
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expectHealthyPage(page, errors);
    await expectNoUnreachableHorizontalContent(page, testInfo);
  });
}

test("redirects legados do TechMove preservam o destino canônico", async ({
  page,
}) => {
  const redirects = [
    ["/workflow/scope-items", "/techmove/scope-items"],
    ["/workflow/bdcq", "/techmove/bdcq"],
    ["/workflow/workshops", "/techmove/workshops"],
    ["/workflow/dcd", "/techmove/dcd"],
    ["/workflow/gaps", "/techmove/gaps"],
    ["/workflow/configurations", "/techmove/configurations"],
    ["/workflow/tests", "/techmove/tests"],
  ] as const;

  for (const [legacy, canonical] of redirects) {
    await page.goto(techMoveUrl(legacy));
    await expect(page).toHaveURL(new RegExp(`${canonical.replace("/", "\\/")}`));
  }
});

test("Kanban de gaps expõe as quatro colunas inclusive em tela estreita", async ({
  page,
}) => {
  await page.goto(techMoveUrl("/techmove/gaps"));

  for (const column of ["Identificado", "Em análise", "Resolvido", "Aceito"])
    await expect(page.getByRole("heading", { name: column, exact: true })).toBeAttached();

  const accepted = page.getByRole("heading", { name: "Aceito", exact: true });
  await accepted.scrollIntoViewIfNeeded();
  await expect(accepted).toBeVisible();
});

