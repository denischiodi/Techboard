import type { GpChecklistItemType } from "../shared/types";

export type GpDocumentationTemplateType = "execution" | "plan" | "workshop" | "quality-gate";

type DocumentationTemplateInput = {
  title: string;
  phase: string;
  workstream: string;
  itemType?: GpChecklistItemType;
  templateType?: GpDocumentationTemplateType;
};

export const GP_DOCUMENTATION_TEMPLATE_LABELS: Record<GpDocumentationTemplateType, string> = {
  execution: "Registro de execução",
  plan: "Plano de atividade",
  workshop: "Ata de workshop",
  "quality-gate": "Validação / Quality Gate",
};

export function inferGpDocumentationTemplate(input: DocumentationTemplateInput): GpDocumentationTemplateType {
  if (input.templateType) return input.templateType;
  const searchable = `${input.title} ${input.workstream}`.toLocaleLowerCase("pt-BR");
  if (input.itemType === "Quality Gate" || /quality gate|aceite|go-live|readiness|prontid/.test(searchable)) return "quality-gate";
  if (/fit-to-standard|workshop|demonstr|cenário|cenario/.test(searchable)) return "workshop";
  if (/planej|plano|estratégia|estrategia|abordagem|desenho|definir/.test(searchable)) return "plan";
  return "execution";
}

export function buildGpDocumentationTemplate(input: DocumentationTemplateInput) {
  const type = inferGpDocumentationTemplate(input);
  const heading = `# ${input.title}\n\n**Fase:** ${input.phase}\n**Workstream:** ${input.workstream}`;

  if (type === "quality-gate") {
    return `${heading}\n\n## Critérios de aceite\n- [ ] Critério 1\n- [ ] Critério 2\n\n## Evidências revisadas\n- \n\n## Riscos e pendências\n- \n\n## Decisão\n- [ ] Aprovado\n- [ ] Aprovado com ressalvas\n- [ ] Não aprovado\n\n## Aprovação\n**Aprovador:** \n**Data:** \n**Observações:** `;
  }

  if (type === "workshop") {
    return `${heading}\n\n## Objetivo\n\n## Participantes\n- \n\n## Processos ou cenários demonstrados\n- \n\n## Decisões tomadas\n- \n\n## Gaps e requisitos delta\n- \n\n## Ações e responsáveis\n- [ ] Ação — Responsável — Prazo\n\n## Evidências / links\n- `;
  }

  if (type === "plan") {
    return `${heading}\n\n## Objetivo\n\n## Escopo\n\n## Entregáveis\n- \n\n## Responsáveis\n- \n\n## Marcos e prazos\n- \n\n## Riscos e dependências\n- \n\n## Critério de conclusão\n- `;
  }

  return `${heading}\n\n## Objetivo\n\n## Entradas necessárias\n- \n\n## Atividades realizadas\n- \n\n## Resultado / decisão\n\n## Pendências e próximos passos\n- [ ] Ação — Responsável — Prazo\n\n## Evidências / links\n- \n\n## Aceite\n**Responsável pela validação:** \n**Data:** `;
}
