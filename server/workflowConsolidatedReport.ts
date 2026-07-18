type ReportInput = {
  project: { name: string; client?: string; manager?: string; startDate?: string; endDate?: string };
  requirements: any[]; dcds: any[]; gaps: any[]; configurations: any[]; testCases?: any[];
};

const clean = (value: unknown) => String(value ?? "").trim() || "-";

export function buildWorkflowConsolidatedMarkdown(input: ReportInput) {
  const { project, requirements, dcds, gaps, configurations, testCases = [] } = input;
  const lines: string[] = [
    "# Relatório consolidado do TechMove",
    "",
    `**Projeto:** ${clean(project.name)}`,
    `**Cliente:** ${clean(project.client)}`,
    `**Gestor:** ${clean(project.manager)}`,
    `**Período:** ${clean(project.startDate)} a ${clean(project.endDate)}`,
    "",
    "## Resumo executivo",
    `- Requisitos do cliente: ${requirements.length}`,
    `- DCDs: ${dcds.length} (${dcds.filter(item => item.status === "Aprovado").length} aprovados)`,
    `- Gaps: ${gaps.length} (${gaps.filter(item => ["Resolvido", "Aceito"].includes(item.status)).length} resolvidos/aceitos)`,
    `- Configurações: ${configurations.length} (${configurations.filter(item => item.status === "Concluído").length} concluídas)`,
    `- Testes: ${testCases.length} (${testCases.filter(item => item.status === "Aprovado").length} aprovados, ${testCases.filter(item => item.status === "Reprovado").length} reprovados)`,
    "",
    "## Requisitos do cliente",
  ];
  if (!requirements.length) lines.push("Nenhum requisito registrado.");
  requirements.forEach((item, index) => lines.push(
    `### ${index + 1}. ${item.code ? `${clean(item.code)} - ` : ""}${clean(item.title)}`,
    `- Módulo: ${clean(item.module)}`,
    `- Categoria: ${clean(item.category)}`,
    `- Prioridade: ${clean(item.priority)}`,
    `- Status: ${clean(item.status)}`,
    `- Responsável: ${clean(item.responsible)}`,
    "",
    clean(item.description),
    "",
    `**Critérios de aceite:** ${clean(item.acceptanceCriteria)}`,
    "",
  ));
  lines.push("## DCDs");
  if (!dcds.length) lines.push("Nenhum DCD registrado.");
  dcds.forEach(item => lines.push(
    `### ${clean(item.title)}`,
    `**Módulo:** ${clean(item.module)} | **Versão:** ${clean(item.version)} | **Status:** ${clean(item.status)}`,
    "",
    clean(item.content),
    "",
  ));
  lines.push("## Gaps");
  if (!gaps.length) lines.push("Nenhum gap registrado.");
  gaps.forEach((item, index) => lines.push(
    `### Gap ${index + 1} - ${clean(item.module)}`,
    `- Impacto: ${clean(item.impact)}`,
    `- Status: ${clean(item.status)}`,
    `- Responsável: ${clean(item.responsible)}`,
    `- Descrição: ${clean(item.description)}`,
    `- Resolução: ${clean(item.resolution)}`,
    "",
  ));
  lines.push("## Configurações");
  if (!configurations.length) lines.push("Nenhuma configuração registrada.");
  configurations.forEach((item, index) => lines.push(
    `### Configuração ${index + 1}`,
    `- Módulo: ${clean(item.module)}`,
    `- Categoria: ${clean(item.category)}`,
    `- Status: ${clean(item.status)}`,
    `- Responsável: ${clean(item.responsible)}`,
    `- Descrição: ${clean(item.description)}`,
    `- Notas: ${clean(item.notes)}`,
    "",
  ));
  lines.push("## Testes unitários e integrados");
  if (!testCases.length) lines.push("Nenhum caso de teste registrado.");
  testCases.forEach((item, index) => lines.push(
    `### ${index + 1}. ${clean(item.code)} - ${clean(item.title)}`,
    `- Tipo: ${clean(item.type)}`,
    `- Módulo: ${clean(item.module)}`,
    `- Status: ${clean(item.status)}`,
    `- Responsável: ${clean(item.responsible)}`,
    `- Data de execução: ${clean(item.executedAt)}`,
    `- Resultado esperado: ${clean(item.expectedResult)}`,
    `- Resultado obtido: ${clean(item.actualResult)}`,
    `- Evidência: ${clean(item.evidence)}`,
    "",
  ));
  return lines.join("\n");
}
